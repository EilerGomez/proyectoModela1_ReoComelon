/**
 * Simulador "El reo comelón" — v3.1
 * Selección aleatoria de platillos y compras con vencimiento aleatorio
 * Guarda reportes diarios con la MISMA estructura que /status
 *
 * Endpoints:
 *  GET /start?escenario=cap&tick=5000
 *  GET /status
 *  GET /stop
 *  GET /reportes            (todos los días, mismos campos que /status)
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

// ---------- BODEGA ----------
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

// ---------- DATOS FIJOS ----------
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

// ---------- CONSUMOS ----------
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
      need  -= take;
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

// ---------- COMPRAS (inmediatas, por faltantes del día) ----------
async function makePurchases(conn, faltantes, escenario, ingredients) {
  if (!faltantes.length) return [];

  const { totalVol } = await getWarehouseOccupancy(conn);
  const cap = await getCapacity(conn, escenario);
  let espacioLibre = cap - totalVol;

  const compras = [];
  for (const f of faltantes) {
    // evitar duplicados en la MISMA compra del día
    if (compras.find(x => x.id_insumo === f.id_insumo)) continue;

    const ing = ingredients.find(x => x.id === f.id_insumo);
    const volUnit = Number(ing.unit_volume);
    const volNeed = volUnit * f.cantidad;
    if (volNeed > espacioLibre) continue; // no hay espacio

    // días de vida aleatorio solo para perecederos
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

// ---------- VENCIMIENTOS ----------
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

  const data = await loadStatic(conn);
  const { dishes, ingredients, recipesByDishClass } = data;

  const reos_total = randInt(175, 180);
  const reos_plus  = Math.round(reos_total * 0.20);
  const reos_std   = reos_total - reos_plus;

  // Menú aleatorio (1 por tiempo)
  const desayunoList = dishes.filter(d => d.time_id === 1);
  const almuerzoList = dishes.filter(d => d.time_id === 2);
  const cenaList     = dishes.filter(d => d.time_id === 3);

  const menu = {
    desayuno: desayunoList[randInt(0, desayunoList.length - 1)],
    almuerzo: almuerzoList[randInt(0, almuerzoList.length - 1)],
    cena:     cenaList[randInt(0, cenaList.length - 1)]
  };

  // Consumir (faltantes se comprarán si hay espacio)
  let faltantesTotales = [];
  faltantesTotales = faltantesTotales.concat(await consumeDish(conn, menu.desayuno, { recipesByDishClass, ingredients }, reos_std, reos_plus));
  faltantesTotales = faltantesTotales.concat(await consumeDish(conn, menu.almuerzo, { recipesByDishClass, ingredients }, reos_std, reos_plus));
  faltantesTotales = faltantesTotales.concat(await consumeDish(conn, menu.cena,     { recipesByDishClass, ingredients }, reos_std, reos_plus));

  const compras = await makePurchases(conn, faltantesTotales, SIM.escenario, ingredients);
  const mermas  = await ageAndPurge(conn, ingredients);

  // Ocupación/Capacidad
  const { totalVol } = await getWarehouseOccupancy(conn);
  const cap   = await getCapacity(conn, SIM.escenario);
  const occPct = Number(((totalVol / cap) * 100).toFixed(2));

  // Armar estado del día (estructura igual a /status)
  const estadoDia = {
    dia: SIM.dia,
    escenario: SIM.escenario,
    reos_total,
    reos_plus,
    menu: {
      desayuno: { id_platillo: menu.desayuno.id, nombre: menu.desayuno.name },
      almuerzo: { id_platillo: menu.almuerzo.id, nombre: menu.almuerzo.name },
      cena:     { id_platillo: menu.cena.id,     nombre: menu.cena.name }
    },
    compras,                 // compras hechas hoy (por faltantes)
    mermas,                  // descartados por vencimiento
    ocupacion_pct: occPct,   // %
    capacidad_m3: cap,
    ocupado_m3: Number(totalVol.toFixed(4)),
    libre_m3: Number((cap - totalVol).toFixed(4))
  };

  // Persistir en daily_report con "misma info" empaquetada en JSONs
  // - menu_json       => menu
  // - purchases_json  => { compras, capacidad_m3, ocupado_m3, libre_m3 }
  // - waste_json      => mermas
  await q(conn, `
    INSERT INTO daily_report
      (day, scenario, inmates_total, inmates_plus, menu_json, purchases_json, waste_json, occupancy_pct)
    VALUES (?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      inmates_total = VALUES(inmates_total),
      inmates_plus  = VALUES(inmates_plus),
      menu_json     = VALUES(menu_json),
      purchases_json= VALUES(purchases_json),
      waste_json    = VALUES(waste_json),
      occupancy_pct = VALUES(occupancy_pct)
  `, [
    estadoDia.dia,
    estadoDia.escenario,
    estadoDia.reos_total,
    estadoDia.reos_plus,
    JSON.stringify(estadoDia.menu),
    JSON.stringify({
      compras: estadoDia.compras,
      capacidad_m3: estadoDia.capacidad_m3,
      ocupado_m3: estadoDia.ocupado_m3,
      libre_m3: estadoDia.libre_m3
    }),
    JSON.stringify(estadoDia.mermas),
    estadoDia.ocupacion_pct
  ]);

  // Guardar en memoria para /status
  SIM.ultimoEstado = estadoDia;
}

// ---------- ENDPOINTS ----------
app.get('/start', async (req, res) => {
  if (SIM.corriendo) return res.json({ msg: 'Ya está corriendo', ...SIM.ultimoEstado });
  SIM.corriendo = true;
  SIM.escenario = req.query.scenario === 'cap65' ? 'cap65' : 'cap';
  SIM.tickMs    = Number(req.query.tick || 5000);
  SIM.dia = 0;

  const conn = await pool();
  SIM.timer = setInterval(async () => {
    try {
      await simulateDay(conn);
      console.log(`[Día ${SIM.dia}] occ=${SIM.ultimoEstado.ocupacion_pct}%`);
    } catch (e) {
      console.error('Error:', e);
    }
  }, SIM.tickMs);

  res.json({ ok: true, msg: 'Simulación iniciada', tickMs: SIM.tickMs, escenario: SIM.escenario });
});

app.get('/status', (req, res) => {
  if (!SIM.ultimoEstado.dia) return res.json({ msg: 'Aún no inicia' });
  res.json(SIM.ultimoEstado);
});

// Trae TODOS los días con la MISMA estructura de /status
app.get('/reportes', async (req, res) => {
  try {
    const conn = await pool();
    const rows = await q(conn, `
      SELECT day, scenario, inmates_total, inmates_plus, menu_json, purchases_json, waste_json, occupancy_pct
      FROM daily_report
      ORDER BY day ASC
    `);

    const list = rows.map(r => {
      const menu = typeof r.menu_json === 'string' ? JSON.parse(r.menu_json) : r.menu_json;
      const comprasPack = typeof r.purchases_json === 'string' ? JSON.parse(r.purchases_json) : r.purchases_json;
      const mermas = typeof r.waste_json === 'string' ? JSON.parse(r.waste_json) : r.waste_json;

      return {
        dia: r.day,
        escenario: r.scenario,
        reos_total: r.inmates_total,
        reos_plus: r.inmates_plus,
        menu,
        compras: comprasPack?.compras || [],
        mermas,
        ocupacion_pct: Number(r.occupancy_pct),
        capacidad_m3: comprasPack?.capacidad_m3 ?? null,
        ocupado_m3:   comprasPack?.ocupado_m3   ?? null,
        libre_m3:     comprasPack?.libre_m3     ?? null
      };
    });

    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo reportes' });
  }
});

app.get('/stop', (req, res) => {
  if (SIM.timer) clearInterval(SIM.timer);
  SIM.corriendo = false;
  res.json({ ok: true, msg: 'Simulación detenida' });
});

app.listen(3000, () => console.log(' Simulador corriendo en http://localhost:3000'));
