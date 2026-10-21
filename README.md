# Saturno

![Saturno](docs/miniatura.png)

Gestión de ausencias. Se llama como el dios romano del tiempo.

Vacaciones, asuntos propios, visitas médicas y teletrabajo con un calendario visual por sección.
Vue 3 + Vite · Node (Express 5) · PostgreSQL. Sin frameworks de UI: el cliente pesa ~45 KB comprimido.

## Puesta en marcha (desarrollo)

```bash
docker compose up -d                 # PostgreSQL en el puerto 5432
cd server && cp .env.example .env && npm install
npm run demo                         # opcional: secciones, usuarios y ausencias de ejemplo
npm run dev                          # API en http://localhost:3000
cd ../client && npm install && npm run dev   # interfaz en http://localhost:5173
```

Administrador inicial: el de `ADMIN_EMAIL` / `ADMIN_PASSWORD` en `.env` (se crea solo si no hay usuarios).
Usuarios demo (contraseña `demo1234`): `jefa.admin@demo.com`, `ana@demo.com`, `luis@demo.com`, `jefe.almacen@demo.com`…

## Producción

```bash
cd client && npm run build      # genera client/dist
cd ../server && npm start       # sirve la API y el cliente en el mismo puerto
```
Configura en `server/.env` al menos `DATABASE_URL`, un `JWT_SECRET` largo y el administrador inicial.

## Reglas de negocio

| | |
|---|---|
| **Ciclo** | 1 de septiembre – 31 de agosto |
| **Vacaciones** | 30 días naturales por ciclo (`VACATION_DAYS_PER_YEAR`), proporcionales a los días contratado dentro del ciclo (365/366) |
| **Devengo** | Progresivo: los días se generan día a día y **se disfrutan a partir del ciclo siguiente**. Lo generado hasta el 31 de agosto es lo que se puede pedir en el ciclo que empieza el 1 de septiembre; lo del ciclo en curso se muestra «generándose» y no se puede pedir todavía |
| **Acumulación** | Los días no caducan: saldo = inicial + generado en los ciclos cerrados + ajustes − aprobados − pendientes |
| **Anticipo** | Si lo consolidado no llega, se pueden pedir vacaciones (días completos, no horas) a cuenta de lo generado en el ciclo **hasta la fecha de inicio de la ausencia**. La solicitud va al jefe marcada «anticipo» y el saldo queda en negativo («días adelantados») hasta que el ciclo se consolida el 1 de septiembre. No deja deudas: cuando se disfruta, ya está generado; y si la persona causa baja antes, esas vacaciones no llegan a disfrutarse |
| **Baja** | Al poner la fecha de baja se anulan solas las ausencias aprobadas o pendientes que empiezan después («Baja el …»), y no se pueden pedir nuevas posteriores |
| **Días enteros** | Por dentro se guardan los decimales (cuentan para el finiquito), pero al trabajador se le muestra y se le deja pedir solo la parte entera: con 25,89 puede pedir 25; los 0,89 se suman a lo del ciclo siguiente. La exportación CSV incluye el saldo exacto y el disfrutable |
| **Asuntos propios** | Cupo por ciclo (2 por defecto, editable), en días laborables, **no** acumulable |
| **Médico / teletrabajo** | Sin cupo; médico admite horas; teletrabajo no cuenta como «fuera» en el cuadrante |
| **Días no laborables** | Fines de semana y festivos no se pueden pedir: toda ausencia empieza en un día laborable. Unas vacaciones sí pueden abarcarlos (de lunes a domingo = 7 días naturales) |
| **Por horas** | En los tipos con «Permite horas» (por defecto vacaciones, médico y teletrabajo): un solo día laborable, descuenta `horas / WORKDAY_HOURS` días (2 h de 8 h = 0,25). Varias el mismo día si no se solapan |
| **Jerarquía** | Cada sección puede depender de otra (Administración → Secciones → «Depende de»). Lógica en `server/src/org.js` |
| **Aprobación** | Usuario → jefe(s) de su sección. Jefe → jefe(s) de la sección superior. Si en un nivel no hay jefe, se sube al siguiente; arriba del todo, administradores. Las pendientes aparecen en la pestaña «Revisar» de quien puede aprobarlas (no se envían correos) |
| **Visibilidad** | Cada sección ve a sus miembros y a los jefes de las secciones que dependen de ella, con aprobadas y pendientes. Un jefe puede ver además el equipo de su superior (los demás jefes). Admin: todo |
| **Motivo privado** | En los tipos marcados (médico por defecto) los compañeros ven «Ausencia» sin motivo. Los comentarios nunca se muestran a compañeros |

**Plantilla que ya existía**: al darla de alta, rellena «Computar saldo desde» (p. ej. 01/09/2026) y «Saldo inicial»
con lo que le quedaba; así no se regeneran ciclos ya disfrutados.

## Festivos

Administración → **Festivos**. Antes de empezar cada año, pulsa «Importar festivos de AAAA…». Nada se guarda hasta
que el administrador confirma, y puede corregir nombres o añadir días de convenio.

- **Años con calendario oficial incluido** (`server/src/holidays-official.js`, hoy 2026 y 2027): se propone la lista
  del decreto del Consell y los locales de Valencia capital, todo marcado y con la fuente citada.
- **Años sin calendario incluido**: propuesta de la API no oficial [date.nager.at](https://date.nager.at) más fechas
  calculadas. Solo vienen marcados los nacionales, San José y el 9 de octubre; el resto de autonómicos (que la
  Generalitat cambia cada año: p. ej. Sant Joan sí en 2026, no en 2027) y los locales vienen **sin marcar y con
  «verificar»**.

**Mantenimiento anual:** cuando la Generalitat publique el decreto del año siguiente (suele ser en primavera–verano) y
el Ayuntamiento sus locales, añade un bloque en `holidays-official.js` copiando el del año anterior.

Los festivos se descuentan en los tipos que se computan en días laborables (asuntos propios, médico, teletrabajo).
Las vacaciones se cuentan en días naturales, así que los incluyen.

## Tests

`cd server && npm test` — cálculo de ciclos, prorrateo, bisiestos, bajas y cómputo natural/laborable.
