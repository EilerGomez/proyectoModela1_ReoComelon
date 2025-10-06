# proyectoModela1_ReoComelon
# 1) BD
mysql -u root -p < schema.sql

# 2) Node
npm init -y
npm install express mysql2
node server.js

# 3) Simular (capacidad normal; 1 día/5s; compras cada 4 días; lead=1) 
##### DEL SERVER 1
curl "http://localhost:3000/start?escenario=cap&tick=5000&review=4&lead=1"

# Estado actual (JSON en español con unidades)
curl "http://localhost:3000/status"

# Histórico
curl "http://localhost:3000/reportes?limite=1000"

# Detener
curl "http://localhost:3000/stop"

## Escenarios: cap y cap65


### DEL SERVER 2

GET /start?escenario=cap&tick=5000&review=4&lead=1

