# local-extension-brief-v1

Escribe un JSON con esta forma; el motor lo valida contra su schema al correr `next`.
Ejemplo válido (caso `verify/parity/cases/skills.build/frames-os/local-extension-brief-v1.json`):

```json
{
  "schema_version": "local-extension-brief-v1",
  "request": "crear una skill local para revisar propuestas de este proyecto antes de enviarlas",
  "extension_kind": "skill",
  "scope": "PROJECT_LOCAL",
  "desired_capability": "Revisar una propuesta del proyecto y señalar cifras sin fuente antes del envío",
  "extension_id": "local.revisor.propuestas"
}
```
