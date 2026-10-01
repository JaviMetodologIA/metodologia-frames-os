# maintenance-request

Escribe un JSON con esta forma; el motor lo valida contra su schema al correr `next`.
Ejemplo válido (caso `verify/parity/cases/meta.maintain/frames-os/maintenance-request.json`):

```json
{
  "schema_version": "maintenance-request-v1",
  "request": "agrega un gate de revisión legal y documéntalo",
  "change_summary": "Un gate humano nuevo, review-legal, para piezas con claims regulados",
  "target_surface": "registry/gates.yml",
  "expected_outcome": "frames doctor lista el gate y la guía explica cuándo usarlo",
  "change_class": "EXTEND"
}
```
