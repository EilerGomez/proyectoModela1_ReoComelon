DROP DATABASE IF EXISTS reo_comelon;
CREATE DATABASE reo_comelon CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE reo_comelon;

-- Tiempos de comida (fijo)
CREATE TABLE times (
  id TINYINT PRIMARY KEY,
  name VARCHAR(32) UNIQUE NOT NULL
);
INSERT INTO times (id,name) VALUES
 (1,'desayuno'),(2,'almuerzo'),(3,'cena');

-- Clases de reos (fijo)
CREATE TABLE classes (
  id TINYINT PRIMARY KEY,
  name VARCHAR(32) UNIQUE NOT NULL
);
INSERT INTO classes (id,name) VALUES
 (1,'estandar'),(2,'plus');

-- Insumos (alimentos)
-- perishable=1 si vence; shelf_life_days NULL si no perecedero
-- unit_type: 'lb' (libras) o 'unidad' (piezas)
CREATE TABLE ingredients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) UNIQUE NOT NULL,
  perishable TINYINT NOT NULL DEFAULT 0,
  shelf_life_days INT NULL,
  unit_type ENUM('lb','unidad') NOT NULL,
  unit_volume DECIMAL(12,6) NOT NULL,  -- m3 por 1 lb o 1 unidad (según unit_type)
  unit_cost DECIMAL(12,4) NOT NULL
);

-- NO perecederos (lb)
INSERT INTO ingredients (name,perishable,shelf_life_days,unit_type,unit_volume,unit_cost) VALUES
 ('ARROZ',0,NULL,'lb',0.0010,6.50),
 ('FRIJOL',0,NULL,'lb',0.0010,8.00),
 ('AVENA',0,NULL,'lb',0.0010,7.20),
 ('CEREAL',0,NULL,'lb',0.0012,9.50),
 ('PASTA',0,NULL,'lb',0.0011,7.80),
 ('HARINA',0,NULL,'lb',0.0010,5.00),
 ('AZUCAR',0,NULL,'lb',0.0010,4.80);

-- Perecederos (unidad)
INSERT INTO ingredients (name,perishable,shelf_life_days,unit_type,unit_volume,unit_cost) VALUES
 ('ATUN_LATA',1,180,'unidad',0.00080,12.00),
 ('LECHE_LATA',1,120,'unidad',0.00100,10.00),
 ('SARDINA_LATA',1,150,'unidad',0.00075,11.00);

-- Platillos
-- base_for_projection: marcar 1 el plato “base” por tiempo (para calcular compras)
CREATE TABLE dishes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64) UNIQUE NOT NULL,
  time_id TINYINT NOT NULL,
  base_for_projection TINYINT NOT NULL DEFAULT 0,
  FOREIGN KEY (time_id) REFERENCES times(id)
);

-- Desayunos
INSERT INTO dishes (name,time_id,base_for_projection) VALUES
 ('DESAYUNO_TRAD',1,1),      -- base
 ('DESAYUNO_AVENA',1,0),
 ('DESAYUNO_CEREAL',1,0);

-- Almuerzos
INSERT INTO dishes (name,time_id,base_for_projection) VALUES
 ('ALMUERZO_ATUN',2,1),      -- base
 ('ALMUERZO_SARDINA',2,0),
 ('ALMUERZO_PASTA_ATUN',2,0);

-- Cenas
INSERT INTO dishes (name,time_id,base_for_projection) VALUES
 ('CENA_FRIJOL',3,1),        -- base
 ('CENA_ARROZ_FRIJOL',3,0),
 ('CENA_PASTA',3,0);

-- Recetas por platillo + clase (cantidad por porción)
CREATE TABLE recipes (
  dish_id INT NOT NULL,
  class_id TINYINT NOT NULL,
  ingredient_id INT NOT NULL,
  qty_per_serving DECIMAL(12,4) NOT NULL,
  PRIMARY KEY (dish_id,class_id,ingredient_id),
  FOREIGN KEY (dish_id) REFERENCES dishes(id),
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Helper IDs (para legibilidad de inserts)
-- (Usamos subselects para mantenerlo portable)

-- === DESAYUNO_TRAD: leche lata + arroz ===
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.25  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_TRAD' AND i.name='LECHE_LATA';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.05  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_TRAD' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.2875 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_TRAD' AND i.name='LECHE_LATA'; -- +15%
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.0575 FROM dishes d, ingredients i WHERE d.name='DESAYUNO_TRAD' AND i.name='ARROZ';

-- === DESAYUNO_AVENA: avena + leche ===
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.20  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_AVENA' AND i.name='AVENA';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.20  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_AVENA' AND i.name='LECHE_LATA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.23  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_AVENA' AND i.name='AVENA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.23  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_AVENA' AND i.name='LECHE_LATA';

-- === DESAYUNO_CEREAL: cereal + leche ===
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.18  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_CEREAL' AND i.name='CEREAL';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.22  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_CEREAL' AND i.name='LECHE_LATA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.207  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_CEREAL' AND i.name='CEREAL';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.253  FROM dishes d, ingredients i WHERE d.name='DESAYUNO_CEREAL' AND i.name='LECHE_LATA';

-- === ALMUERZO_ATUN: arroz + atún === (base ya estaba en tu esquema)
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.10  FROM dishes d, ingredients i WHERE d.name='ALMUERZO_ATUN' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.18  FROM dishes d, ingredients i WHERE d.name='ALMUERZO_ATUN' AND i.name='ATUN_LATA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.115 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_ATUN' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.207 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_ATUN' AND i.name='ATUN_LATA';

-- === ALMUERZO_SARDINA: arroz + sardina lata ===
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.10  FROM dishes d, ingredients i WHERE d.name='ALMUERZO_SARDINA' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.18  FROM dishes d, ingredients i WHERE d.name='ALMUERZO_SARDINA' AND i.name='SARDINA_LATA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.115 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_SARDINA' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.207 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_SARDINA' AND i.name='SARDINA_LATA';

-- === ALMUERZO_PASTA_ATUN: pasta + atún ===
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.20  FROM dishes d, ingredients i WHERE d.name='ALMUERZO_PASTA_ATUN' AND i.name='PASTA';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.15  FROM dishes d, ingredients i WHERE d.name='ALMUERZO_PASTA_ATUN' AND i.name='ATUN_LATA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.23  FROM dishes d, ingredients i WHERE d.name='ALMUERZO_PASTA_ATUN' AND i.name='PASTA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.1725 FROM dishes d, ingredients i WHERE d.name='ALMUERZO_PASTA_ATUN' AND i.name='ATUN_LATA';

-- === CENA_FRIJOL: frijol + arroz === (base ya estaba en tu esquema)
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.14  FROM dishes d, ingredients i WHERE d.name='CENA_FRIJOL' AND i.name='FRIJOL';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.07  FROM dishes d, ingredients i WHERE d.name='CENA_FRIJOL' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.161 FROM dishes d, ingredients i WHERE d.name='CENA_FRIJOL' AND i.name='FRIJOL';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.0805 FROM dishes d, ingredients i WHERE d.name='CENA_FRIJOL' AND i.name='ARROZ';

-- === CENA_ARROZ_FRIJOL: arroz + frijol (proporciones algo distintas)
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.12  FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_FRIJOL' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.10  FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_FRIJOL' AND i.name='FRIJOL';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.138  FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_FRIJOL' AND i.name='ARROZ';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.115  FROM dishes d, ingredients i WHERE d.name='CENA_ARROZ_FRIJOL' AND i.name='FRIJOL';

-- === CENA_PASTA: pasta + leche (ligero)
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.22 FROM dishes d, ingredients i WHERE d.name='CENA_PASTA' AND i.name='PASTA';
INSERT INTO recipes
SELECT d.id, 1, i.id, 0.10 FROM dishes d, ingredients i WHERE d.name='CENA_PASTA' AND i.name='LECHE_LATA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.253 FROM dishes d, ingredients i WHERE d.name='CENA_PASTA' AND i.name='PASTA';
INSERT INTO recipes
SELECT d.id, 2, i.id, 0.115 FROM dishes d, ingredients i WHERE d.name='CENA_PASTA' AND i.name='LECHE_LATA';

-- Capacidad bodega (escenarios)
CREATE TABLE warehouse (
  id TINYINT PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  capacity_m3 DECIMAL(12,4) NOT NULL
);
INSERT INTO warehouse VALUES (1,'cap',12.0),(2,'cap65',12.0*1.65);

-- Inventario por lotes
CREATE TABLE inventory_lots (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  ingredient_id INT NOT NULL,
  qty DECIMAL(14,4) NOT NULL,       -- lb o unidad según unit_type
  days_remaining INT NULL,          -- NULL = no perecedero
  created_day INT NOT NULL DEFAULT 0,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Semilla inventario inicial
-- lb (no perecederos)
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 300.0, NULL, 0 FROM ingredients WHERE name='ARROZ';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 250.0, NULL, 0 FROM ingredients WHERE name='FRIJOL';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 120.0, NULL, 0 FROM ingredients WHERE name='PASTA';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 100.0, NULL, 0 FROM ingredients WHERE name='AVENA';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 110.0, NULL, 0 FROM ingredients WHERE name='CEREAL';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 80.0, NULL, 0 FROM ingredients WHERE name='HARINA';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 60.0, NULL, 0 FROM ingredients WHERE name='AZUCAR';

-- unidades (perecederos)
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 70.0, 180, 0 FROM ingredients WHERE name='ATUN_LATA';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 90.0, 120, 0 FROM ingredients WHERE name='LECHE_LATA';
INSERT INTO inventory_lots (ingredient_id,qty,days_remaining,created_day)
SELECT id, 50.0, 150, 0 FROM ingredients WHERE name='SARDINA_LATA';

-- Cola de pedidos (órdenes planificadas)
CREATE TABLE purchase_orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  planned_day INT NOT NULL,
  eta_day INT NOT NULL,
  scenario VARCHAR(16) NOT NULL,
  status ENUM('scheduled','arrived','cancelled') NOT NULL DEFAULT 'scheduled'
);

CREATE TABLE purchase_order_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  ingredient_id INT NOT NULL,
  qty DECIMAL(14,4) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
);

-- Reportes de cada día
CREATE TABLE daily_report (
  day INT NOT NULL,
  scenario VARCHAR(16) NOT NULL,
  inmates_total INT NOT NULL,
  inmates_plus INT NOT NULL,
  menu_json JSON NOT NULL,
  purchases_json JSON NOT NULL,
  waste_json JSON NOT NULL,
  occupancy_pct DECIMAL(6,2) NOT NULL,
  PRIMARY KEY (day, scenario)
);


