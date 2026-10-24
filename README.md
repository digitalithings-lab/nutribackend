# NutriPro · Backend

API de NutriPro (gestión de consulta nutricional): NestJS 11 + Prisma 6 + PostgreSQL.

Cada nutricionista tiene su espacio privado: pacientes, consultas, planes, recetas y alimentos
propios cuelgan de `nutritionist_id` y la API siempre filtra por la cuenta que hace la petición.
La administración ve cuentas, planes comerciales y soporte, nunca datos clínicos.

## Desarrollo local

Requiere Node 22.

```bash
npm install
cp .env.example .env   # y rellena los valores
npx prisma migrate deploy
npm run dev
```

## Despliegue en Railway

Variables del servicio del backend:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | `openssl rand -base64 32` |
| `ADMIN_EMAILS` | correos con acceso de administración, separados por comas |
| `GROQ_API_KEY` | clave de Groq para analizar fotos de comida (app del paciente) |

Al arrancar, `npm start` aplica las migraciones pendientes (crea las tablas), carga los catálogos
(planes, sistemas de intercambio y alimentos) y levanta la API.

## Flujo clínico

1. **Paciente y expediente**: datos, antecedentes, historia alimentaria, laboratorios y medicamentos.
2. **Consulta**: peso, talla y medidas → indicadores (IMC, cintura, ICC, cintura-talla, masa grasa, peso ideal/ajustado).
3. **Plan alimentario** (`POST /patients/:id/meal-plans` crea un borrador completo a partir de la última consulta):
   - Energía automática (Mifflin-St Jeor, Harris-Benedict, FAO/OMS, Owen, Katch-McArdle, kcal/kg) × factor de actividad ± ajuste, o manual.
   - Macronutrientes en % → gramos.
   - Sistema de intercambios: tradicional, Panamá o combinado.
   - Intercambios diarios sugeridos y reparto por tiempos de comida (todo editable).
   - Menú con alimentos, recetas y sustituciones equivalentes.
   - Validación contra el objetivo (±5 % energía, ±10 % macros) y aprobación profesional.
4. **PDF** para el paciente y **seguimiento** con nuevas consultas (adherencia, síntomas, cambios) y evolución.

Las equivalencias y porciones de los catálogos son valores de referencia. La administración puede
ajustarlas (`PATCH /admin/exchange-groups/:id`, `/admin/foods`) y la decisión clínica es siempre de la nutricionista.

## Rutas

Todas exigen `Authorization: Bearer <accessToken>`, salvo las marcadas como públicas.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de la API y la base de datos (pública) |
| GET | `/plans` | Planes comerciales activos (pública) |
| POST | `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout` | Cuenta y sesión |
| GET | `/auth/me` | Usuario actual |
| POST | `/auth/change-password` | Cambiar contraseña |
| GET / PATCH | `/account` | Perfil, consultorio y valores por defecto |
| GET / POST | `/support` | Solicitudes de soporte |
| GET | `/home` | Resumen del panel principal |
| GET / POST | `/patients` | Listar (`?search=&archived=true`) / crear |
| GET / PATCH / DELETE | `/patients/:id` | Expediente completo / editar / borrar |
| POST | `/patients/:id/archive` · `/restore` | Archivar o reactivar |
| PUT | `/patients/:id/background` · `/diet-history` | Antecedentes · historia alimentaria |
| POST, PUT, DELETE | `/patients/:id/labs[/:labId]` · `/medications[/:medId]` | Laboratorios · medicamentos |
| GET | `/patients/:id/evolution` | Serie de medidas e indicadores |
| GET / POST | `/appointments` | Agenda (`?from=&to=`) / nueva cita |
| PATCH / DELETE | `/appointments/:id` | Reprogramar, cambiar estado (aceptar `SCHEDULED` o rechazar `REJECTED` una solicitud, con `responseNote`) / borrar |
| GET / POST | `/patients/:id/consultations` | Consultas del paciente / nueva |
| GET / PATCH / DELETE | `/consultations/:id` | Detalle con indicadores / editar / borrar |
| GET | `/exchange-systems` | Sistemas y grupos de intercambio |
| GET / POST | `/foods` | Buscar (`?search=&source=PANAMA,CUSTOM&groupKey=`) / alimento propio |
| PATCH / DELETE | `/foods/:id` | Editar / borrar alimento propio |
| GET | `/foods/:id/equivalents` | Sustitutos del mismo grupo |
| GET / POST / PATCH / DELETE | `/recipes[/:id]` | Recetas con totales por ración |
| GET / POST | `/patients/:id/meal-plans` | Planes del paciente / nuevo borrador |
| GET / PATCH / DELETE | `/meal-plans/:id` | Plan con totales y validación / título, objetivos, recomendaciones |
| PUT | `/meal-plans/:id/energy` · `/macros` · `/exchange-mode` · `/exchanges` · `/meals` | Pasos del plan |
| POST | `/meal-plans/:id/suggest-exchanges` · `/distribute` | Sugerir intercambios · repartir por comidas |
| POST / PATCH / DELETE | `/meal-plans/:id/meals/:mealId/items` · `/meal-plans/:id/items/:itemId` | Menú y sustituciones |
| POST | `/meal-plans/:id/approve` · `/reopen` · `/duplicate` | Aprobar (409 si hay diferencias sin confirmar) · reabrir · copiar |
| GET | `/reports/meal-plans/:id/plan.pdf` · `/calculations.pdf` | Plan para el paciente · cálculos |
| GET | `/reports/consultations/:id/evaluation.pdf` | Evaluación nutricional |
| GET | `/reports/patients/:id/progress.pdf` | Informe de progreso |
| POST / DELETE | `/patients/:id/app-invite` · `/patients/:id/app-access` | Código para activar la app · quitar acceso |
| GET | `/patients/:id/app-activity` | Comidas y pesos registrados por el paciente |
| GET | `/auth/link-code/:code` | Qué es un código: invitación a un expediente o código de una nutricionista (pública) |
| POST | `/auth/register-patient` | Activación de la app con cualquiera de los dos códigos (pública) |
| POST | `/account/link-code` | Generar un código de vinculación nuevo para la nutricionista |
| GET / POST | `/me/appointments` | Citas del paciente / solicitar una (queda `REQUESTED` hasta que la nutricionista la acepte) |
| GET | `/me/appointments/busy?date=` | Horarios ocupados de la nutricionista ese día |
| POST | `/me/appointments/:id/cancel` | Cancelar una cita o solicitud |
| GET | `/me` · `/me/plan` · `/me/exchange-list` · `/me/day?date=` | App del paciente: perfil, plan aprobado, intercambios, resumen del día |
| POST | `/me/food-scans` | Foto (base64) → estimación de calorías con Groq y comparación con el plan |
| GET / POST / DELETE | `/me/food-logs` · `/me/weights` | Comidas y pesos del paciente |
| GET | `/me/progress` · `/me/appointments` | Evolución y próximas citas |
| GET | `/admin/overview` · `/admin/users` · `/admin/plans` · `/admin/tickets` | Administración |
| PATCH / PUT | `/admin/users/:id/status` · `/admin/users/:id/subscription` | Suspender · cambiar plan |
