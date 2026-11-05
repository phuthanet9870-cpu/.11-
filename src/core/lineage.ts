// Class lineage: a class plus every class whose skills and gear it keeps.
// `parent` is the job it was promoted from; `inherits` lets a reborn
// (transcendent) class keep the skills of its pre-rebirth equivalent.
import type { GameData } from './data';

export function classLineage(data: GameData, classId: string): string[] {
  const out: string[] = [];
  const visit = (id: string | undefined) => {
    const cur = id ? data.classes.get(id) : undefined;
    if (!cur || out.includes(cur.id)) return;
    visit(cur.parent);
    visit(cur.inherits);
    out.push(cur.id);
  };
  visit(classId);
  return out;
}
