/**
 * Simulador "El reo comelón" — v6.1
 * - Menú aleatorio por tiempo (des/alm/cena)
 * - Día de compra (periódico): cada REVIEW_EVERY días, antes de cocinar, se programa una orden
 *   que cubre ~85% de ese ciclo de revisión usando platos base (y además considera el carrito).
 * - Compras de emergencia: SOLO si en un tiempo no hay ningun platillo factible y NO es día de compra.
 * - Carrito pendiente: agrega faltantes por ingrediente (sin duplicados), no compra al instante.
 * - Bodega: respeta capacidad; perecederos con caducidad aleatoria 1..30 días; no perecederos NULL.
 * - Mermas correctas: no se reportan mermas de lotes con qty=0 (se limpian y se eliminan al consumir).
 *
 * Endpoints:
 *  GET /start?escenario=cap&tick=5000&review=4&lead=1
 *  GET /status
 *  GET /stop
 *  GET /reportes?escenario=cap&desde=1&hasta=9999&limite=1000
 */

const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
app.use(express.json());

// ---------- CONFIG ----------
const DB = { host: 'localhost', user: 'root', password: 'mysql', database: 'reo_comelon' };

// Estado
let SIM = {
  corriendo: false,
  tickMs: 5000,
  dia: 0,
  timer: null,
  escenario: 'cap',
  REVIEW_EVERY: 4,
  LEAD: 1,
  // carrito pendiente: array de {id_insumo, nombre, unidad, cantidad}
  cart: [],
  ultimoEstado: {}
};

// Utils
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

async function pool() { return mysql.createPool(DB); }
async function q(conn, sql, params = []) { const [rows] = await conn.execute(sql, params); return rows; }

// ---------- Capacidad ----------
async function getWarehouseOccupancy(conn) {
  const rows = await q(conn, `
    SELECT i.id, i.unit_volume, COALESCE(SUM(l.qty),0) AS qty
    FROM ingredients i
    LEFT JOIN inventory_lots l ON i.id = l.ingredient_id
    GROUP BY i.id, i.unit_volume
  `);
  let vol = 0;
  for (const r of rows) vol += Number(r.unit_volume) * Number(r.qty || 0);
  return vol;
}
async function getCapacity(conn, scenario) {
  const [row] = await q(conn, `SELECT capacity_m3 FROM warehouse WHERE name=?`, [scenario]);
  return Number(row.capacity_m3);
}
async function capacityFree(conn, scenario) {
  const cap = await getCapacity(conn, scenario);
  const occ = await getWarehouseOccupancy(conn);
  return { cap, occ, free: cap - occ };
}

// ---------- Datos estáticos ----------
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
function ingName(ingredients, id) { return (ingredients.find(x => x.id === id) || {}).name || String(id); }
function ingUnit(ingredients, id) { return (ingredients.find(x => x.id === id) || {}).unit_type || ''; }
function ingVol(ingredients, id)  { return Number((ingredients.find(x => x.id === id) || {}).unit_volume || 0); }
function ingPerishable(ingredients, id) { return ((ingredients.find(x => x.id === id) || {}).perishable === 1); }
function ingUnitType(ingredients, id) { return (ingredients.find(x => x.id === id) || {}).unit_type || 'lb'; }

// ---------- Inventario FIFO ----------
async function consumeIngredient(conn, ingredientId, qtyNeeded) {
  if (qtyNeeded <= 0) return { taken: 0, missing: 0 };
  const lots = await q(conn, `
    SELECT * FROM inventory_lots
    WHERE ingredient_id=?
    ORDER BY (days_remaining IS NULL), days_remaining ASC
  `, [ingredientId]);

  let need = qtyNeeded, taken = 0;
  for (const lot of lots) {
    if (need <= 0) break;
    const lotQty = Number(lot.qty);
    const take = Math.min(lotQty, need);
    if (take > 0) {
      await q(conn, `UPDATE inventory_lots SET qty=qty-? WHERE id=?`, [take, lot.id]);
      taken += take;
      need  -= take;

      // 🔧 NUEVO: si el lote quedó en 0 (o casi), eliminarlo para no generar mermas de qty=0
      const remaining = lotQty - take;
      if (remaining <= 1e-9) {
        await q(conn, `DELETE FROM inventory_lots WHERE id=?`, [lot.id]);
      }
    }
  }
  return { taken, missing: Math.max(0, need) };
}

// Chequeo de factibilidad de un plato con el stock ACTUAL (sin comprar)
async function canCookDish(conn, dish, data, reos_std, reos_plus) {
  const { recipesByDishClass } = data;
  for (const cls of [1, 2]) {
    const reos = cls === 1 ? reos_std : reos_plus;
    const recs = recipesByDishClass[`${dish.id}:${cls}`] || [];
    for (const r of recs) {
      const req = Number(r.qty_per_serving) * reos;
      const [row] = await q(conn, `SELECT COALESCE(SUM(qty),0) AS qty FROM inventory_lots WHERE ingredient_id=?`, [r.ingredient_id]);
      const have = Number(row.qty || 0);
      if (have + 1e-9 < req) return false;
    }
  }
  return true;
}

// Consume un plato (descuenta stock) y devuelve faltantes SI los hubiera
async function consumeDish(conn, dish, data, reos_std, reos_plus) {
  const { recipesByDishClass, ingredients } = data;
  const faltantes = [];

  for (const cls of [1, 2]) {
    const reos = cls === 1 ? reos_std : reos_plus;
    const recs = recipesByDishClass[`${dish.id}:${cls}`] || [];
    for (const r of recs) {
      const req = Number(r.qty_per_serving) * reos;
      const res = await consumeIngredient(conn, r.ingredient_id, req);
      if (res.missing > 1e-9) {
        faltantes.push({
          id_insumo: r.ingredient_id,
          nombre: ingName(ingredients, r.ingredient_id),
          unidad: ingUnit(ingredients, r.ingredient_id),
          cantidad: res.missing
        });
      }
    }
  }
  return faltantes;
}

// ---------- Carrito pendiente ----------
function addToCart(shortages) {
  if (!Array.isArray(shortages) || shortages.length === 0) return;
  const map = new Map(SIM.cart.map(x => [x.id_insumo, { ...x }]));
  for (const it of shortages) {
    if (map.has(it.id_insumo)) {
      const cur = map.get(it.id_insumo);
      cur.cantidad = Number((cur.cantidad + Number(it.cantidad)).toFixed(4));
      map.set(it.id_insumo, cur);
    } else {
      map.set(it.id_insumo, { ...it, cantidad: Number(Number(it.cantidad).toFixed(4)) });
    }
  }
  SIM.cart = Array.from(map.values());
}

// ---------- Proyección de demanda (platos base) ----------
function projectedDemandForIngredient(days, ingredientId, data, N_std, N_plus) {
  const { dishes, recipesByDishClass } = data;
  const baseDishes = dishes.filter(x => Number(x.base_for_projection) === 1);
  if (baseDishes.length === 0) return 0;

  let total = 0;
  for (let d = 0; d < days; d++) {
    for (const dish of baseDishes) {
      const recsStd = recipesByDishClass[`${dish.id}:1`] || [];
      const rStd = recsStd.find(r => r.ingredient_id === ingredientId);
      if (rStd) total += Number(rStd.qty_per_serving) * N_std;

      const recsPlus = recipesByDishClass[`${dish.id}:2`] || [];
      const rPlus = recsPlus.find(r => r.ingredient_id === ingredientId);
      if (rPlus) total += Number(rPlus.qty_per_serving) * N_plus;
    }
  }
  return total;
}

// Programa una orden a partir del carrito + cobertura 85% del ciclo, respetando capacidad
async function scheduleOrderFromCart(conn, data, coverageDays, N_std, N_plus) {
  const { ingredients } = data;
  const { free } = await capacityFree(conn, SIM.escenario);
  let freeVol = Math.max(0, free);
  if (freeVol <= 1e-9) return { orderId: null, items: [] };

  if (!SIM.cart || SIM.cart.length === 0) return { orderId: null, items: [] };

  // Para cada item del carrito, calculamos: need = max(cart_need, demand85 - stock)
  const items = [];
  for (const it of SIM.cart) {
    const ingId = it.id_insumo;
    const [row] = await q(conn, `SELECT COALESCE(SUM(qty),0) AS qty FROM inventory_lots WHERE ingredient_id=?`, [ingId]);
    const stock = Number(row.qty || 0);
    const demand85 = projectedDemandForIngredient(coverageDays, ingId, data, N_std, N_plus);
    let need = Math.max(Number(it.cantidad), Math.max(0, demand85 - stock));
    if (ingUnitType(ingredients, ingId) === 'unidad') need = Math.ceil(need - 1e-9);
    if (need <= 1e-9) continue;

    const volUnit = ingVol(ingredients, ingId);
    const volNeed = volUnit * need;
    if (volNeed <= freeVol) {
      items.push({ ingredient_id: ingId, qty: Number(need.toFixed(4)) });
      freeVol -= volNeed;
    }
    if (freeVol <= 1e-9) break;
  }

  if (items.length === 0) return { orderId: null, items: [] };

  // Crear orden programada
  const [res] = await conn.execute(
    `INSERT INTO purchase_orders (planned_day, eta_day, scenario, status) VALUES (?,?,?,'scheduled')`,
    [SIM.dia, SIM.dia + SIM.LEAD, SIM.escenario]
  );
  const orderId = res.insertId;

  for (const it of items) {
    await q(conn, `INSERT INTO purchase_order_items (order_id, ingredient_id, qty) VALUES (?,?,?)`,
      [orderId, it.ingredient_id, it.qty]);
  }

  // Quitar del carrito lo comprado
  const remain = new Map(SIM.cart.map(x => [x.id_insumo, { ...x }]));
  for (const it of items) {
    const cur = remain.get(it.ingredient_id);
    if (!cur) continue;
    const left = Number((cur.cantidad - it.qty).toFixed(4));
    if (left > 1e-9) {
      cur.cantidad = left;
      remain.set(it.ingredient_id, cur);
    } else {
      remain.delete(it.ingredient_id);
    }
  }
  SIM.cart = Array.from(remain.values());

  // Salida legible
  const pretty = items.map(it => ({
    id_insumo: it.ingredient_id,
    nombre: ingName(ingredients, it.ingredient_id),
    unidad: ingUnit(ingredients, it.ingredient_id),
    cantidad: it.qty,
    eta_dia: SIM.dia + SIM.LEAD
  }));

  return { orderId, items: pretty };
}

// ---------- Arribos de órdenes programadas ----------
async function applyArrivals(conn, today, data) {
  const { ingredients } = data;
  const orders = await q(conn, `SELECT * FROM purchase_orders WHERE status='scheduled' AND eta_day=?`, [today]);
  for (const o of orders) {
    const items = await q(conn, `SELECT * FROM purchase_order_items WHERE order_id=?`, [o.id]);
    for (const it of items) {
      const peri = ingPerishable(ingredients, it.ingredient_id);
      const dr = peri ? randInt(1, 30) : null;
      await q(conn, `INSERT INTO inventory_lots (ingredient_id, qty, days_remaining, created_day)
                     VALUES (?,?,?,?)`,
        [it.ingredient_id, it.qty, dr, today]);
    }
    await q(conn, `UPDATE purchase_orders SET status='arrived' WHERE id=?`, [o.id]);
  }
  return orders.length;
}

// ---------- Envejecer y purgar ----------
async function ageAndPurge(conn, data) {
  const { ingredients } = data;

  // 🔧 NUEVO: limpia lotes vacíos (cualquier tipo)
  await q(conn, `DELETE FROM inventory_lots WHERE qty <= 1e-9`);

  const rows = await q(conn, `
    SELECT id, ingredient_id, qty, days_remaining
    FROM inventory_lots
    WHERE days_remaining IS NOT NULL
  `);

  const mermas = [];
  for (const r of rows) {
    const newDays = Number(r.days_remaining) - 1;
    if (newDays <= 0) {
      // Registrar merma solo si hay cantidad > 0
      if (Number(r.qty) > 1e-9) {
        mermas.push({
          id_insumo: r.ingredient_id,
          nombre: ingName(ingredients, r.ingredient_id),
          unidad: ingUnit(ingredients, r.ingredient_id),
          cantidad: Number(r.qty)
        });
      }
      await q(conn, `DELETE FROM inventory_lots WHERE id=?`, [r.id]);
    } else {
      await q(conn, `UPDATE inventory_lots SET days_remaining=? WHERE id=?`, [newDays, r.id]);
    }
  }
  return mermas;
}

// ---------- Lógica por tiempo ----------
async function pickAndCookForTime(conn, timeId, data, reos_std, reos_plus, isPurchaseDay) {
  const { dishes } = data;
  const options = dishes.filter(d => d.time_id === timeId);
  const pickRandom = () => options[Math.floor(Math.random() * options.length)];

  const feasibles = [];
  for (const d of options) {
    if (await canCookDish(conn, d, data, reos_std, reos_plus)) feasibles.push(d);
  }
  let chosen = null;
  let comprasEmergencia = [];

  const pushEmerg = (it) => {
    const idx = comprasEmergencia.findIndex(x => x.id_insumo === it.id_insumo);
    if (idx >= 0) {
      comprasEmergencia[idx].cantidad = Number((comprasEmergencia[idx].cantidad + it.cantidad).toFixed(4));
    } else {
      comprasEmergencia.push({ ...it });
    }
  };

  if (feasibles.length > 0) {
    chosen = feasibles[Math.floor(Math.random() * feasibles.length)];
    const falt = await consumeDish(conn, chosen, data, reos_std, reos_plus);
    if (falt.length > 0) addToCart(falt);
  } else {
    chosen = pickRandom();
    if (!isPurchaseDay) {
      // emergencia solo si NO es día de compra
      // Primero calculamos faltantes intentando consumir
      const falt = await consumeDish(conn, chosen, data, reos_std, reos_plus);
      if (falt.length > 0) {
        addToCart(falt);
        const { ingredients } = data;
        const { free } = await capacityFree(conn, SIM.escenario);
        let freeVol = Math.max(0, free);
        for (const it of falt) {
          const v = ingVol(ingredients, it.id_insumo);
          let need = Number(it.cantidad);
          if (ingUnitType(ingredients, it.id_insumo) === 'unidad') need = Math.ceil(need - 1e-9);
          const volNeed = v * need;
          if (v > 0 && volNeed > freeVol) continue;

          const dr = ingPerishable(ingredients, it.id_insumo) ? randInt(1, 30) : null;
          await q(conn, `INSERT INTO inventory_lots (ingredient_id, qty, days_remaining, created_day)
                         VALUES (?,?,?,?)`,
            [it.id_insumo, need, dr, SIM.dia]);
          pushEmerg({
            id_insumo: it.id_insumo,
            nombre: it.nombre,
            unidad: it.unidad,
            cantidad: Number(need.toFixed(4)),
            dias_vida: dr
          });
          freeVol -= v * need;
          if (freeVol <= 1e-9) break;
        }
        // reintentar consumo
        const falt2 = await consumeDish(conn, chosen, data, reos_std, reos_plus);
        if (falt2.length > 0) addToCart(falt2);
      }
    } else {
      // Es día de compra, ya programamos antes; si aún falta, solo agregar a carrito
      const falt = await consumeDish(conn, chosen, data, reos_std, reos_plus);
      if (falt.length > 0) addToCart(falt);
    }
  }

  return {
    elegido: { id_platillo: chosen.id, nombre: chosen.name },
    comprasEmergencia
  };
}

// ---------- Simulación diaria ----------
async function simulateDay(conn) {
  SIM.dia += 1;

  const data = await loadStatic(conn);

  // Llegan órdenes programadas hoy
  await applyArrivals(conn, SIM.dia, data);

  // Demanda (usamos hoy para plan de cobertura)
  const reos_total = randInt(175, 180);
  const reos_plus = Math.round(reos_total * 0.20);
  const reos_std = reos_total - reos_plus;

  // ¿Es día de compra periódica?
  const isPurchaseDay = ((SIM.dia - 1) % SIM.REVIEW_EVERY === 0);
  let compras_programadas_hoy = [];

  if (isPurchaseDay) {
    // cobertura ~85% del ciclo
    const coverageDays = Math.max(1, Math.floor(0.85 * SIM.REVIEW_EVERY));
    const plan = await scheduleOrderFromCart(conn, data, coverageDays, reos_std, reos_plus);
    compras_programadas_hoy = plan.items; // llegan en eta_dia
  }

  // Procesar por tiempo (menú aleatorio)
  const des = await pickAndCookForTime(conn, 1, data, reos_std, reos_plus, isPurchaseDay);
  const alm = await pickAndCookForTime(conn, 2, data, reos_std, reos_plus, isPurchaseDay);
  const cen = await pickAndCookForTime(conn, 3, data, reos_std, reos_plus, isPurchaseDay);

  // Envejecer / purgar
  const mermas = await ageAndPurge(conn, data);

  // Ocupación
  const { cap, occ, free } = await capacityFree(conn, SIM.escenario);
  const occPct = Number(((occ / cap) * 100).toFixed(2));

  // Guardar reporte del día
  await q(conn, `
    INSERT INTO daily_report (day, scenario, inmates_total, inmates_plus, menu_json, purchases_json, waste_json, occupancy_pct)
    VALUES (?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE inmates_total=VALUES(inmates_total), inmates_plus=VALUES(inmates_plus),
                            menu_json=VALUES(menu_json), purchases_json=VALUES(purchases_json),
                            waste_json=VALUES(waste_json), occupancy_pct=VALUES(occupancy_pct)
  `, [
    SIM.dia, SIM.escenario, reos_total, reos_plus,
    JSON.stringify({
      desayuno: des.elegido,
      almuerzo: alm.elegido,
      cena:     cen.elegido
    }),
    JSON.stringify({
      programadas_hoy: compras_programadas_hoy,   // llegan en eta_dia
      emergencia_hoy:  [...des.comprasEmergencia, ...alm.comprasEmergencia, ...cen.comprasEmergencia],
      carrito_pendiente: SIM.cart                 // snapshot del carrito tras programar (lo que quedó)
    }),
    JSON.stringify(mermas),
    occPct
  ]);

  // Estado visible
  SIM.ultimoEstado = {
    dia: SIM.dia,
    escenario: SIM.escenario,
    reos_total,
    reos_plus,
    menu: {
      desayuno: des.elegido,
      almuerzo: alm.elegido,
      cena:     cen.elegido
    },
    compras_programadas_hoy,
    compras_emergencia_hoy: [...des.comprasEmergencia, ...alm.comprasEmergencia, ...cen.comprasEmergencia],
    carrito_pendiente: SIM.cart,
    mermas_hoy: mermas,
    ocupacion_pct: occPct,
    capacidad_m3: cap,
    ocupado_m3: Number(occ.toFixed(4)),
    libre_m3: Number(free.toFixed(4))
  };
}

// ---------- Endpoints ----------
app.get('/start', async (req, res) => {
  if (SIM.corriendo) return res.json({ ok: true, msg: 'Ya está corriendo', ...SIM.ultimoEstado });

  SIM.escenario     = (req.query.escenario === 'cap65') ? 'cap65' : 'cap';
  SIM.tickMs        = Number(req.query.tick || 5000);
  SIM.REVIEW_EVERY  = Number(req.query.review || 4);
  SIM.LEAD          = Number(req.query.lead || 1);
  SIM.dia = 0;
  SIM.cart = [];

  const conn = await pool();
  SIM.corriendo = true;
  SIM.timer = setInterval(async () => {
    try {
      await simulateDay(conn);
      console.log(`[Día ${SIM.dia}] occ=${SIM.ultimoEstado.ocupacion_pct}% cart=${SIM.cart.length} items`);
    } catch (err) {
      console.error('Error simulando día:', err);
    }
  }, SIM.tickMs);

  res.json({
    ok: true, msg: 'Simulación iniciada',
    escenario: SIM.escenario, tickMs: SIM.tickMs,
    review: SIM.REVIEW_EVERY, lead: SIM.LEAD
  });
});

app.get('/status', (req, res) => {
  if (!SIM.corriendo) return res.json({ corriendo: false, msg: 'Aún no inicia' });
  res.json({ corriendo: true, ...SIM.ultimoEstado });
});

app.get('/stop', (req, res) => {
  if (SIM.timer) clearInterval(SIM.timer);
  SIM.corriendo = false;
  res.json({ ok: true, msg: 'Simulación detenida' });
});

app.get('/reportes', async (req, res) => {
  try {
    const conn = await pool();

    // Traemos capacidades por escenario para calcular ocupado/libre históricamente
    const capsRows = await q(conn, `SELECT name, capacity_m3 FROM warehouse`);
    const capMap = new Map(capsRows.map(r => [r.name, Number(r.capacity_m3)]));

    const escenario = (req.query.escenario === 'cap65') ? 'cap65' : (req.query.escenario === 'cap' ? 'cap' : null);
    const desde = Number(req.query.desde || 1);
    const hasta = Number(req.query.hasta || 999999);
    const limite = Number(req.query.limite || 1000);

    let sql = `SELECT day AS dia, scenario AS escenario, inmates_total AS reos_total, inmates_plus AS reos_plus,
               menu_json AS menu, purchases_json AS compras, waste_json AS mermas, occupancy_pct AS ocupacion_pct
               FROM daily_report WHERE day BETWEEN ? AND ?`;
    const params = [desde, hasta];
    if (escenario) { sql += ` AND scenario=?`; params.push(escenario); }
    sql += ` ORDER BY day ASC LIMIT ?`; params.push(limite);

    const rows = await q(conn, sql, params);

    const parsed = rows.map(r => {
      const cap = capMap.get(r.escenario) || 0;
      const occPct = Number(r.ocupacion_pct);
      const ocupado = Number(((occPct / 100) * cap).toFixed(4));
      const libre = Number((cap - ocupado).toFixed(4));
      return {
        dia: r.dia,
        escenario: r.escenario,
        reos_total: r.reos_total,
        reos_plus: r.reos_plus,
        menu: typeof r.menu === 'string' ? JSON.parse(r.menu) : r.menu,
        compras: typeof r.compras === 'string' ? JSON.parse(r.compras) : r.compras,
        mermas: typeof r.mermas === 'string' ? JSON.parse(r.mermas) : r.mermas,
        ocupacion_pct: occPct,
        capacidad_m3: cap,
        ocupado_m3: ocupado,
        libre_m3: libre
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo reportes' });
  }
});

app.listen(3000, () => console.log('✅ Simulador v6.1 escuchando en http://localhost:3000'));
