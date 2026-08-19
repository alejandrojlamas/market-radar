# Política de seguridad

## Alcance soportado

Se mantiene la rama principal actual. Las copias antiguas o modificadas deben actualizarse antes de evaluar un reporte.

## Reportar una vulnerabilidad

Usa el reporte privado de vulnerabilidades de GitHub si está habilitado en el repositorio. Si no lo está, solicita un canal privado al responsable sin publicar detalles del exploit, datos personales, credenciales ni contenido de una base local en un issue público.

Incluye, cuando sea posible:

- versión o commit afectado;
- impacto y prerrequisitos;
- pasos mínimos de reproducción con datos ficticios;
- mitigación sugerida.

No incluyas API keys reales. Revoca y rota cualquier credencial que haya quedado expuesta.

## Modelo operativo

MercadoRadar está diseñado para una sola persona y escucha en `127.0.0.1` por defecto. No incluye cuentas de usuario ni autorización propia.

- Mantén el servidor en loopback.
- Para acceso remoto, usa un proxy con TLS y autenticación delante de la aplicación.
- Define `MERCADORADAR_ALLOWED_ORIGINS` con orígenes completos y exactos; no se admiten comodines.
- Conserva la cabecera `x-mercadoradar-request: same-origin` en clientes que realicen mutaciones.
- Prefiere variables de entorno o el gestor de secretos del entorno para las claves de proveedores.
- No publiques `data/mercadoradar.sqlite`, sus archivos WAL/SHM, logs ni exportaciones de cartera.

La base local puede contener credenciales, cartera y diario de decisiones sin cifrado a nivel de aplicación. Protege los permisos y el cifrado del equipo anfitrión, y elimina ese estado antes de compartir una copia del proyecto.

## Dependencias y validación

Antes de desplegar cambios, ejecuta:

```bash
npm ci
npm run lint
npm test
npm run build
```

Revisa también alertas de dependencias y evita ejecutar builds de contribuciones no confiables con secretos presentes en el entorno.
