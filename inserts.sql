USE reo_comelon;
/* =========================
 * MÁS INSUMOS (INGREDIENTS)
 * ========================= */

-- No perecederos (lb)
INSERT INTO ingredients (name,perishable,shelf_life_days,unit_type,unit_volume,unit_cost) VALUES
 ('MAIZ',0,NULL,'lb',0.0010,5.80),
 ('LENTEJA',0,NULL,'lb',0.0010,7.10),
 ('SAL',0,NULL,'lb',0.0010,1.50),
 ('ACEITE',0,NULL,'lb',0.0012,10.00);

-- Perecederos (algunos por lb, otros por unidad)
INSERT INTO ingredients (name,perishable,shelf_life_days,unit_type,unit_volume,unit_cost) VALUES
 ('HUEVO',1,21,'unidad',0.00040,2.50),
 ('POLLO',1,7,'lb',0.00150,18.00),
 ('QUESO',1,30,'lb',0.00110,16.00),
 ('YOGUR',1,20,'unidad',0.00070,9.00),
 ('PLATANO',1,10,'unidad',0.00060,3.20),
 ('TOMATE',1,14,'lb',0.00100,6.20);

/* =========================
 * MÁS PLATILLOS (DISHES)
 * ========================= */

-- Desayunos (time_id = 1)
INSERT INTO dishes (name,time_id,base_for_projection) VALUES
 ('DESAYUNO_HUEVO_ARROZ',1,0),
 ('DESAYUNO_YOGUR_CEREAL',1,0),
 ('DESAYUNO_PAN_QUESO',1,0),
 ('DESAYUNO_PLATANO_AVENA',1,0);

-- Almuerzos (time_id = 2)
INSERT INTO dishes (name,time_id,base_for_projection) VALUES
 ('ALMUERZO_POLLO_ARROZ',2,0),
 ('ALMUERZO_CARNE_LENTEJA',2,0),
 ('ALMUERZO_POLLO_PASTA',2,0),
 ('ALMUERZO_LENTEJA_ARROZ',2,0);

-- Cenas (time_id = 3)
INSERT INTO dishes (name,time_id,base_for_projection) VALUES
 ('CENA_ARROZ_POLLO',3,0),
 ('CENA_LENTEJA',3,0),
 ('CENA_HUEVO_ARROZ',3,0),
 ('CENA_PAN_QUESO',3,0);

/* =========================
 * RECETAS (RECIPES) por clase
 * Nota: clase 2 (plus) ~ +15%
 * ========================= */

-- === DESAYUNO_HUEVO_ARROZ: huevo (unidad) + arroz (lb) ===
INSERT INTO recipes
SELECT d.id,1,i.id,1.00 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_HUEVO_ARROZ' AND i.name='HUEVO';
INSERT INTO recipes
SELECT d.id,1,i.id,0.06 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_HUEVO_ARROZ' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id,2,i.id,1.15 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_HUEVO_ARROZ' AND i.name='HUEVO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.069 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_HUEVO_ARROZ' AND i.name='ARROZ';

-- === DESAYUNO_YOGUR_CEREAL: yogur (unidad) + cereal (lb) ===
INSERT INTO recipes
SELECT d.id,1,i.id,1.00 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_YOGUR_CEREAL' AND i.name='YOGUR';
INSERT INTO recipes
SELECT d.id,1,i.id,0.16 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_YOGUR_CEREAL' AND i.name='CEREAL';
INSERT INTO recipes
SELECT d.id,2,i.id,1.15 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_YOGUR_CEREAL' AND i.name='YOGUR';
INSERT INTO recipes
SELECT d.id,2,i.id,0.184 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_YOGUR_CEREAL' AND i.name='CEREAL';

-- === DESAYUNO_PAN_QUESO: harina (lb) para pan + queso (lb) ===
INSERT INTO recipes
SELECT d.id,1,i.id,0.10 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_PAN_QUESO' AND i.name='HARINA';
INSERT INTO recipes
SELECT d.id,1,i.id,0.08 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_PAN_QUESO' AND i.name='QUESO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.115 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_PAN_QUESO' AND i.name='HARINA';
INSERT INTO recipes
SELECT d.id,2,i.id,0.092 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_PAN_QUESO' AND i.name='QUESO';

-- === DESAYUNO_PLATANO_AVENA: plátano (unidad) + avena (lb) ===
INSERT INTO recipes
SELECT d.id,1,i.id,1.00 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_PLATANO_AVENA' AND i.name='PLATANO';
INSERT INTO recipes
SELECT d.id,1,i.id,0.14 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_PLATANO_AVENA' AND i.name='AVENA';
INSERT INTO recipes
SELECT d.id,2,i.id,1.15 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_PLATANO_AVENA' AND i.name='PLATANO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.161 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_PLATANO_AVENA' AND i.name='AVENA';

-- === ALMUERZO_POLLO_ARROZ: pollo (lb) + arroz (lb) + aceite (lb) ===
INSERT INTO recipes
SELECT d.id,1,i.id,0.22 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_ARROZ' AND i.name='POLLO';
INSERT INTO recipes
SELECT d.id,1,i.id,0.11 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_ARROZ' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id,1,i.id,0.02 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_ARROZ' AND i.name='ACEITE';
INSERT INTO recipes
SELECT d.id,2,i.id,0.253 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_ARROZ' AND i.name='POLLO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.127 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_ARROZ' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id,2,i.id,0.023 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_ARROZ' AND i.name='ACEITE';

-- === ALMUERZO_CARNE_LENTEJA: carne (usaremos POLLO como carne blanca) + lenteja + tomate ===
INSERT INTO recipes
SELECT d.id,1,i.id,0.18 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_CARNE_LENTEJA' AND i.name='POLLO';
INSERT INTO recipes
SELECT d.id,1,i.id,0.16 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_CARNE_LENTEJA' AND i.name='LENTEJA';
INSERT INTO recipes
SELECT d.id,1,i.id,0.05 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_CARNE_LENTEJA' AND i.name='TOMATE';
INSERT INTO recipes
SELECT d.id,2,i.id,0.207 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_CARNE_LENTEJA' AND i.name='POLLO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.184 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_CARNE_LENTEJA' AND i.name='LENTEJA';
INSERT INTO recipes
SELECT d.id,2,i.id,0.0575 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_CARNE_LENTEJA' AND i.name='TOMATE';

-- === ALMUERZO_POLLO_PASTA: pollo + pasta + tomate ===
INSERT INTO recipes
SELECT d.id,1,i.id,0.20 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_PASTA' AND i.name='POLLO';
INSERT INTO recipes
SELECT d.id,1,i.id,0.22 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_PASTA' AND i.name='PASTA';
INSERT INTO recipes
SELECT d.id,1,i.id,0.06 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_PASTA' AND i.name='TOMATE';
INSERT INTO recipes
SELECT d.id,2,i.id,0.23 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_PASTA' AND i.name='POLLO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.253 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_PASTA' AND i.name='PASTA';
INSERT INTO recipes
SELECT d.id,2,i.id,0.069 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_POLLO_PASTA' AND i.name='TOMATE';

-- === ALMUERZO_LENTEJA_ARROZ: lenteja + arroz ===
INSERT INTO recipes
SELECT d.id,1,i.id,0.18 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_LENTEJA_ARROZ' AND i.name='LENTEJA';
INSERT INTO recipes
SELECT d.id,1,i.id,0.10 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_LENTEJA_ARROZ' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id,2,i.id,0.207 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_LENTEJA_ARROZ' AND i.name='LENTEJA';
INSERT INTO recipes
SELECT d.id,2,i.id,0.115 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_LENTEJA_ARROZ' AND i.name='ARROZ';

-- === CENA_ARROZ_POLLO: arroz + pollo + aceite ===
INSERT INTO recipes
SELECT d.id,1,i.id,0.12 FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_POLLO' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id,1,i.id,0.18 FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_POLLO' AND i.name='POLLO';
INSERT INTO recipes
SELECT d.id,1,i.id,0.015 FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_POLLO' AND i.name='ACEITE';
INSERT INTO recipes
SELECT d.id,2,i.id,0.138 FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_POLLO' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id,2,i.id,0.207 FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_POLLO' AND i.name='POLLO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.0173 FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_POLLO' AND i.name='ACEITE';

-- === CENA_LENTEJA: lenteja + tomate + sal (ligero) ===
INSERT INTO recipes
SELECT d.id,1,i.id,0.22 FROM dishes d, ingredients i WHERE d.name='CENA_LENTEJA' AND i.name='LENTEJA';
INSERT INTO recipes
SELECT d.id,1,i.id,0.05 FROM dishes d, ingredients i WHERE d.name='CENA_LENTEJA' AND i.name='TOMATE';
INSERT INTO recipes
SELECT d.id,1,i.id,0.005 FROM dishes d, ingredients i WHERE d.name='CENA_LENTEJA' AND i.name='SAL';
INSERT INTO recipes
SELECT d.id,2,i.id,0.253 FROM dishes d, ingredients i WHERE d.name='CENA_LENTEJA' AND i.name='LENTEJA';
INSERT INTO recipes
SELECT d.id,2,i.id,0.0575 FROM dishes d, ingredients i WHERE d.name='CENA_LENTEJA' AND i.name='TOMATE';
INSERT INTO recipes
SELECT d.id,2,i.id,0.00575 FROM dishes d, ingredients i WHERE d.name='CENA_LENTEJA' AND i.name='SAL';

-- === CENA_HUEVO_ARROZ: huevo (unidad) + arroz (lb) ===
INSERT INTO recipes
SELECT d.id,1,i.id,1.00 FROM dishes d, ingredients i WHERE d.name='CENA_HUEVO_ARROZ' AND i.name='HUEVO';
INSERT INTO recipes
SELECT d.id,1,i.id,0.08 FROM dishes d, ingredients i WHERE d.name='CENA_HUEVO_ARROZ' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id,2,i.id,1.15 FROM dishes d, ingredients i WHERE d.name='CENA_HUEVO_ARROZ' AND i.name='HUEVO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.092 FROM dishes d, ingredients i WHERE d.name='CENA_HUEVO_ARROZ' AND i.name='ARROZ';

-- === CENA_PAN_QUESO: harina (lb) para pan + queso (lb) ===
INSERT INTO recipes
SELECT d.id,1,i.id,0.12 FROM dishes d, ingredients i WHERE d.name='CENA_PAN_QUESO' AND i.name='HARINA';
INSERT INTO recipes
SELECT d.id,1,i.id,0.10 FROM dishes d, ingredients i WHERE d.name='CENA_PAN_QUESO' AND i.name='QUESO';
INSERT INTO recipes
SELECT d.id,2,i.id,0.138 FROM dishes d, ingredients i WHERE d.name='CENA_PAN_QUESO' AND i.name='HARINA';
INSERT INTO recipes
SELECT d.id,2,i.id,0.115 FROM dishes d, ingredients i WHERE d.name='CENA_PAN_QUESO' AND i.name='QUESO';

/* =========================
 * SEMILLA DE INVENTARIO (opc.)
 * ========================= */

-- No perecederos recién agregados
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 120.0, NULL, 0 FROM ingredients WHERE name='MAIZ';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 140.0, NULL, 0 FROM ingredients WHERE name='LENTEJA';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 60.0, NULL, 0 FROM ingredients WHERE name='SAL';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 80.0, NULL, 0 FROM ingredients WHERE name='ACEITE';

-- Perecederos recién agregados
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 180.0, 21, 0 FROM ingredients WHERE name='HUEVO';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 160.0, 7, 0 FROM ingredients WHERE name='POLLO';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 90.0, 30, 0 FROM ingredients WHERE name='QUESO';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 120.0, 20, 0 FROM ingredients WHERE name='YOGUR';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 150.0, 10, 0 FROM ingredients WHERE name='PLATANO';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 100.0, 14, 0 FROM ingredients WHERE name='TOMATE';

