# architecture-decision-v1

Escribe un JSON con esta forma; el motor lo valida contra su schema al correr `next`.
Ejemplo válido (caso `verify/parity/cases/skills.build/frames-os/architecture-decision-v1.json`):

```json
{
  "schema_version": "skill-architecture-decision-v1",
  "decision_id": "DEC-PROPUESTAS",
  "case_id": "CASE-PROPUESTAS",
  "capability_map_id": "MAP-PROPUESTAS",
  "decision": "CREATE",
  "selected_topology": ["SKILL-REVISOR"],
  "rejected_alternatives": ["ampliar improve: audita páginas, no propuestas"],
  "tradeoffs": ["una skill más que mantener a cambio de una revisión repetible"],
  "migration_required": false,
  "fallback": "revisión manual con la lista de chequeo del equipo",
  "owner": "consultor",
  "content_sha256": "d67aaa9297faef88fcbf31539e598b83ddf432742bee7a9bbfe609aefd1ef382"
}
```
