// Every domain the engine can execute. registry:check fails when a declared
// handler or schema is missing from these.
import { content } from './content/index.ts';
import { deck } from './deck/index.ts';
import { nlm } from './nlm/index.ts';
import { trainer } from './trainer/index.ts';
import { career } from './career/index.ts';
import { improve } from './improve/index.ts';
import { skills } from './skills/index.ts';
import { maintain } from './maintain/index.ts';
import { aula } from './aula/index.ts';

export const domains = [content, deck, nlm, trainer, career, improve, skills, maintain, aula];
