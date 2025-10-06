/**
 * Simulador "El reo comelón" — v3
 * Selección aleatoria de platillos y compras con vencimiento aleatorio
 * 
 * Endpoints:
 *  GET /start?escenario=cap&tick=5000
 *  GET /status
 *  GET /stop
 *  GET /reportes
 */

const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
app.use(express.json());

// ---------- CONFIG ----------
const DB = { host: 'localhost', user: 'root', password: 'mysql', database: 'reo_comelon' };

let SIM = {
  corriendo: false,
  tickMs: 5000,
  dia: 0,
  timer: null,
  escenario: 'cap',
  ultimoEstado: {}
};

const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

async function pool() { return mysql.createPool(DB); }
async function q(conn, sql, params = []) { const [rows] = await conn.execute(sql, params); return rows; }

// ---------- FUNCIONES DE BODEGA ----------
async function getWarehouseOccupancy(conn) {
  const rows = await q(conn, `
    SELECT i.id, i.name, i.unit_volume, COALESCE(SUM(l.qty),0) AS qty
    FROM ingredients i
    LEFT JOIN inventory_lots l ON i.id = l.ingredient_id
    GROUP BY i.id, i.name, i.unit_volume
  `);
  let vol = 0;
  for (const r of rows) vol += Number(r.unit_volume) * Number(r.qty || 0);
  return { totalVol: vol };
}
async function getCapacity(conn, scenario) {
  const [row] = await q(conn, `SELECT capacity_m3 FROM warehouse WHERE name=?`, [scenario]);
  return Number(row.capacity_m3);
}

// ---------- FUNCIONES PRINCIPALES ----------
async function loadStatic(conn) {
  const dishes = await q(conn, `SELECT * FROM dishes`);
  const ingredients = await q(conn, `SELECT * FROM ingredients`);
  const recipes = await q(conn, `SELECT * FROM recipes`);
  const byDishClass = {};
  for (const r of recipes) {
    const key = `${r.dish_id}:${r.class_id}`;
    byDishClass[key] = byDishClass[key] || [];
    byDishClass[key].push(r);
  }
  return { dishes, ingredients, recipesByDishClass: byDishClass };
}

async function consumeIngredient(conn, ingredientId, qtyNeeded) {
  const lots = await q(conn, `
    SELECT * FROM inventory_lots
    WHERE ingredient_id=? ORDER BY (days_remaining IS NULL), days_remaining ASC
  `, [ingredientId]);
  let need = qtyNeeded, taken = 0;
  for (const lot of lots) {
    if (need <= 0) break;
    const take = Math.min(Number(lot.qty), need);
    if (take > 0) {
      await q(conn, `UPDATE inventory_lots SET qty=qty-? WHERE id=?`, [take, lot.id]);
      taken += take;
      need -= take;
    }
  }
  return { taken, missing: Math.max(0, need) };
}

async function consumeDish(conn, dish, data, reos_std, reos_plus) {
  const { recipesByDishClass, ingredients } = data;
  const faltantes = [];

  for (const cls of [1, 2]) {
    const reos = cls === 1 ? reos_std : reos_plus;
    const recs = recipesByDishClass[`${dish.id}:${cls}`] || [];
    for (const r of recs) {
      const req = Number(r.qty_per_serving) * reos;
      const res = await consumeIngredient(conn, r.ingredient_id, req);
      if (res.missing > 0) {
        const ing = ingredients.find(x => x.id === r.ingredient_id);
        faltantes.push({
          id_insumo: r.ingredient_id,
          nombre: ing.name,
          unidad: ing.unit_type,
          cantidad: res.missing
        });
      }
    }
  }
  return faltantes;
}

async function makePurchases(conn, faltantes, escenario, ingredients) {
  if (!faltantes.length) return [];

  const { totalVol } = await getWarehouseOccupancy(conn);
  const cap = await getCapacity(conn, escenario);
  let espacioLibre = cap - totalVol;

  const compras = [];
  for (const f of faltantes) {
    if (compras.find(x => x.id_insumo === f.id_insumo)) continue; // evitar duplicados
    const ing = ingredients.find(x => x.id === f.id_insumo);
    const volUnit = Number(ing.unit_volume);
    const volNeed = volUnit * f.cantidad;
    if (volNeed > espacioLibre) continue; // no hay espacio

    // generar días de vida aleatorio (solo perecederos)
    const diasVida = ing.perishable ? randInt(1, 30) : null;
    await q(conn, `INSERT INTO inventory_lots (ingredient_id, qty, days_remaining, created_day)
                   VALUES (?,?,?,?)`, [ing.id, f.cantidad, diasVida, SIM.dia]);

    compras.push({
      id_insumo: ing.id,
      nombre: ing.name,
      unidad: ing.unit_type,
      cantidad: Number(f.cantidad.toFixed(4)),
      dias_vida: diasVida
    });
    espacioLibre -= volNeed;
  }
  return compras;
}

async function ageAndPurge(conn, ingredients) {
  const rows = await q(conn, `SELECT id, ingredient_id, qty, days_remaining FROM inventory_lots WHERE days_remaining IS NOT NULL`);
  const mermas = [];
  for (const r of rows) {
    const newDays = r.days_remaining - 1;
    if (newDays <= 0) {
      const ing = ingredients.find(x => x.id === r.ingredient_id);
      mermas.push({
        id_insumo: ing.id,
        nombre: ing.name,
        unidad: ing.unit_type,
        cantidad: r.qty
      });
      await q(conn, `DELETE FROM inventory_lots WHERE id=?`, [r.id]);
    } else {
      await q(conn, `UPDATE inventory_lots SET days_remaining=? WHERE id=?`, [newDays, r.id]);
    }
  }
  return mermas;
}

// ---------- SIMULACIÓN DIARIA ----------
async function simulateDay(conn) {
  SIM.dia += 1;
  const { dishes, ingredients } = await loadStatic(conn);

  const reos_total = randInt(175, 180);
  const reos_plus = Math.round(reos_total * 0.2);
  const reos_std = reos_total - reos_plus;

  // Elegir menú aleatorio
  const desayuno = dishes.filter(d => d.time_id === 1);
  const almuerzo = dishes.filter(d => d.time_id === 2);
  const cena = dishes.filter(d => d.time_id === 3);

  const menu = {
    desayuno: desayuno[randInt(0, desayuno.length - 1)],
    almuerzo: almuerzo[randInt(0, almuerzo.length - 1)],
    cena: cena[randInt(0, cena.length - 1)]
  };

  // Intentar cocinar cada platillo
  let faltantesTotales = [];
  faltantesTotales = faltantesTotales.concat(await consumeDish(conn, menu.desayuno, { recipesByDishClass: (await loadStatic(conn)).recipesByDishClass, ingredients }, reos_std, reos_plus));
  faltantesTotales = faltantesTotales.concat(await consumeDish(conn, menu.almuerzo, { recipesByDishClass: (await loadStatic(conn)).recipesByDishClass, ingredients }, reos_std, reos_plus));
  faltantesTotales = faltantesTotales.concat(await consumeDish(conn, menu.cena, { recipesByDishClass: (await loadStatic(conn)).recipesByDishClass, ingredients }, reos_std, reos_plus));

  // Compras si hay faltantes y espacio
  const compras = await makePurchases(conn, faltantesTotales, SIM.escenario, ingredients);

  // Envejecer y eliminar vencidos
  const mermas = await ageAndPurge(conn, ingredients);

  // Ocupación
  const { totalVol } = await getWarehouseOccupancy(conn);
  const cap = await getCapacity(conn, SIM.escenario);
  const occPct = ((totalVol / cap) * 100).toFixed(2);

  SIM.ultimoEstado = {
    dia: SIM.dia,
    escenario: SIM.escenario,
    reos_total,
    reos_plus,
    menu: {
      desayuno: { id_platillo: menu.desayuno.id, nombre: menu.desayuno.name },
      almuerzo: { id_platillo: menu.almuerzo.id, nombre: menu.almuerzo.name },
      cena: { id_platillo: menu.cena.id, nombre: menu.cena.name }
    },
    compras,
    mermas,
    ocupacion_pct: Number(occPct),
    capacidad_m3: cap,
    ocupado_m3: Number(totalVol.toFixed(4)),
    libre_m3: Number((cap - totalVol).toFixed(4))
  };
}

// ---------- ENDPOINTS ----------
app.get('/start', async (req, res) => {
  if (SIM.corriendo) return res.json({ msg: 'Ya está corriendo', ...SIM.ultimoEstado });
  SIM.corriendo = true;
  SIM.escenario = req.query.escenario === 'cap65' ? 'cap65' : 'cap';
  SIM.tickMs = Number(req.query.tick || 5000);
  SIM.dia = 0;

  const conn = await pool();
  SIM.timer = setInterval(async () => {
    try {
      await simulateDay(conn);
      console.log(`[Día ${SIM.dia}]`, SIM.ultimoEstado);
    } catch (e) {
      console.error('Error:', e);
    }
  }, SIM.tickMs);

  res.json({ ok: true, msg: 'Simulación iniciada', tickMs: SIM.tickMs, escenario: SIM.escenario });
});

app.get('/status', (req, res) => res.json(SIM.ultimoEstado || { msg: 'Aún no inicia' }));

app.get('/stop', (req, res) => {
  if (SIM.timer) clearInterval(SIM.timer);
  SIM.corriendo = false;
  res.json({ ok: true, msg: 'Simulación detenida' });
});

app.get('/reportes', async (req, res) => {
  const conn = await pool();
  const rows = await q(conn, `SELECT * FROM daily_report ORDER BY day ASC`);
  res.json(rows);
});

app.listen(3000, () => console.log('✅ Simulador corriendo en http://localhost:3000'));
