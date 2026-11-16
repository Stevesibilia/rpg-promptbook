import {
  nightPartOf,
  scenePartOf,
  SCENE_PARTS,
  sectionPdf,
  templateColumn,
  type AdventureTemplate,
  type Column,
  type NightPart,
  type Place,
  type ScenePart,
} from 'promptbook-format';

// A small sketch of the night page or of a scene page under the Sections and
// Scene fields tabs (mockup states 3 and 4, template-placement design
// decision A9): which parts print in the main column and which in the side
// one, in the order the PDF prints them (design decision A5), following the
// draft at once. A section the template leaves out is not in it.

export interface SketchPart {
  part: NightPart | ScenePart;
  name: string;
}

export interface Sketch {
  top: string;
  main: SketchPart[];
  side: SketchPart[];
  // The dashed chips of what the layout places before and after the parts.
  mainBefore: string[];
  mainAfter: string[];
  sideAfter: string[];
  // The dashed chip under both columns; null for none.
  bottom: string | null;
}

// The side boxes the template allows in a place, as the sketch names them.
function sideBoxes(template: AdventureTemplate, place: Place): string[] {
  return template.callouts
    .filter((c) => c.column === 'side' && (c.allowedIn.includes(place) || (place !== 'scene' && c.allowedIn.includes('anySection'))))
    .map((c) => `[!${c.meta ? `${c.type}|${c.meta}` : c.type}] boxes`);
}

const by = (column: Column, template: AdventureTemplate) => (p: SketchPart) => templateColumn(template, p.part) === column;

// The night page: the overview full width, then the night parts the template
// prints, the revelations where the overview's row is. The side column puts
// the reminders first, as the layout does.
export function nightSketch(template: AdventureTemplate): Sketch {
  const overview = template.sections.find((s) => s.role === 'overview');
  const parts: SketchPart[] = [];
  for (const section of template.sections) {
    if (!sectionPdf(section, 'adventure').print) continue;
    if (section.role === 'overview') parts.push({ part: 'revelations', name: template.overview.revelations });
    const part = nightPartOf(section.role);
    if (part) parts.push({ part, name: section.heading ?? section.name });
  }
  const side = parts.filter(by('side', template));
  return {
    top: overview ? (overview.heading ?? overview.name) : 'Overview',
    main: parts.filter(by('main', template)),
    side: [...side.filter((p) => p.part === 'reminders'), ...side.filter((p) => p.part !== 'reminders')],
    mainBefore: [],
    mainAfter: [],
    sideAfter: sideBoxes(template, 'overview'),
    bottom: null,
  };
}

// A scene page: within each column the four fields keep the layout's fixed
// order, whatever the table's.
export function sceneSketch(template: AdventureTemplate): Sketch {
  const field = (part: ScenePart) => template.sceneFields.find((f) => scenePartOf(f.role) === part);
  const parts = SCENE_PARTS.flatMap((part): SketchPart[] => {
    const f = field(part);
    return f ? [{ part, name: f.label }] : [];
  });
  const label = (role: string, fallback: string) => template.sceneFields.find((f) => f.role === role)?.label ?? fallback;
  const readAloud = template.callouts.find((c) => c.role === 'readAloud');
  return {
    top: ['Title', label('place', 'Luogo e momento'), label('inPlay', 'In gioco')].join(' · '),
    main: parts.filter(by('main', template)),
    side: parts.filter(by('side', template)),
    mainBefore: readAloud ? [readAloud.label] : [],
    mainAfter: [`Boxes, ${label('tests', 'Prove e regole')}, reactions, ${label('derail', 'Se deragliano')}`],
    sideAfter: ['Threat sheets', ...sideBoxes(template, 'scene')],
    bottom: 'Climax fields and other labels',
  };
}

export function PageSketch({ page, template }: { page: 'night' | 'scene'; template: AdventureTemplate }) {
  const sketch = page === 'night' ? nightSketch(template) : sceneSketch(template);
  const fixed = (text: string) => (
    <div className="p fx" key={`fx:${text}`}>
      {text}
    </div>
  );
  const title = page === 'night' ? 'Night page' : 'Scene page';
  const main = [
    ...sketch.mainBefore.map(fixed),
    ...sketch.main.map((p) => (
      <div className="p" key={p.part}>
        {p.name}
      </div>
    )),
    ...sketch.mainAfter.map(fixed),
  ];
  return (
    <div className="sk" role="figure" aria-label={`${title} sketch`} data-testid={`${page}-sketch`}>
      <h4>{title} · where each part prints</h4>
      <div className="pg">
        <div className="full">{fixed(sketch.top)}</div>
        <div className="c" data-testid="sketch-main">
          <span className="cap">Main column</span>
          {main.length ? main : <span className="none">nothing</span>}
        </div>
        <div className="c" data-testid="sketch-side">
          <span className="cap">Side column · 58 mm</span>
          {sketch.side.map((p) => (
            <div className="p box" key={p.part}>
              {p.name}
            </div>
          ))}
          {sketch.sideAfter.map(fixed)}
        </div>
        {sketch.bottom && <div className="full">{fixed(sketch.bottom)}</div>}
      </div>
    </div>
  );
}
