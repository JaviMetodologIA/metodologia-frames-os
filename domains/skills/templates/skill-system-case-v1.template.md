# skill-system-case-v1

Escribe un JSON con esta forma; el motor lo valida contra su schema al correr `next`.
Ejemplo válido (caso `verify/parity/cases/skills.build/frames-os/skill-system-case-v1.json`):

```json
{
  "schema_version": "skill-system-case-v1",
  "case_id": "CASE-PROPUESTAS",
  "parent_id": null,
  "request": "necesito una skill para revisar propuestas antes de enviarlas",
  "scope": "CANONICAL",
  "desired_outcome": "Cada propuesta sale sin cifras sin fuente ni promesas sin alcance",
  "source_refs": ["docs/scope.md"],
  "authority_status": "VERIFIED",
  "effect_ceiling": "E1",
  "acceptance": [
    "dispara ante pedidos de revisar una propuesta",
    "no dispara ante pedidos de contenido para redes"
  ],
  "blocking_gaps": [],
  "owner": "consultor",
  "content_sha256": "d67aaa9297faef88fcbf31539e598b83ddf432742bee7a9bbfe609aefd1ef382"
}
```
