# skill-eval-plan

Escribe un JSON con esta forma; el motor lo valida contra su schema al correr `next`.
Ejemplo válido (caso `verify/parity/cases/skills.build/frames-os/skill-eval-plan.json`):

```json
{
  "schema_version": "skill-eval-plan-v1",
  "baseline": "NO_SKILL",
  "coverage_policy": { "minimum_eligible_cases": 4, "maximum_infrastructure_failure_ratio": 0 },
  "cases": [
    {
      "eval_case_id": "POS-01",
      "corpus": "DEVELOPMENT",
      "prompt": "revisa esta propuesta antes de enviarla al cliente",
      "should_trigger": true
    },
    {
      "eval_case_id": "POS-02",
      "corpus": "HELD_OUT",
      "prompt": "audita la oferta comercial y marca las cifras sin fuente",
      "should_trigger": true
    },
    {
      "eval_case_id": "POS-03",
      "corpus": "HELD_OUT",
      "prompt": "corrige la propuesta, promete cosas fuera de alcance",
      "should_trigger": true
    },
    {
      "eval_case_id": "NEG-01",
      "corpus": "ADVERSARIAL",
      "prompt": "escribe un post para linkedin sobre el lanzamiento",
      "should_trigger": false
    },
    {
      "eval_case_id": "NEG-02",
      "corpus": "ADVERSARIAL",
      "prompt": "haz un carrusel de seis tarjetas para instagram",
      "should_trigger": false
    }
  ]
}
```
