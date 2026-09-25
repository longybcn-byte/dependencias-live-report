# Dependencias críticas, informe live para ClickUp

Proyecto listo para desplegar en un servicio cloud con Docker. Sirve un panel visual protegido por contraseña y expone `GET /api/report`, que consulta ClickUp directamente en cada carga y cada actualización automática.

## Seguridad

- El token de ClickUp vive solo en el servidor, nunca en el HTML ni en el navegador.
- El panel usa una cookie de sesión `HttpOnly`, `SameSite=Strict`, firmada con HMAC.
- `helmet`, CSP, no-cache y rate limit de login están activados.
- Configura HTTPS en el proveedor cloud. En producción, la cookie se marca `Secure`.
- No subas `.env` al repositorio.

## Variables de entorno

Copia `.env.example` como `.env` y completa:

- `CLICKUP_API_TOKEN`: token personal u OAuth de ClickUp.
- `CLICKUP_LIST_ID`: ID de la lista que quieres monitorizar. Para Hospital Clinic: `901222512417`.
- `REPORT_PASSWORD`: contraseña de acceso al panel.
- `SESSION_SECRET`: cadena aleatoria de al menos 32 caracteres.
- `PORT`: lo define normalmente el proveedor cloud.

## Ejecución local

```bash
cp .env.example .env
npm install
npm start
```

Abre `http://localhost:3000`.

## Despliegue cloud

1. Sube esta carpeta a un repositorio privado.
2. Crea un servicio web desde el repositorio o usa el `Dockerfile`.
3. Añade las variables de entorno en el panel de secretos del proveedor.
4. Usa `npm start` como comando de arranque o construye la imagen Docker.
5. Protege el dominio con HTTPS y limita el acceso de red si tu proveedor lo permite.

## Comportamiento live

- Al abrir el panel, `GET /api/report` lee tareas y dependencias actuales desde ClickUp.
- El navegador vuelve a leer cada 30 segundos y permite actualizar manualmente.
- Las respuestas llevan `Cache-Control: no-store`.
- El informe no escribe ni modifica tareas.
