import { useEffect, useMemo } from 'react';
import { templates } from 'promptbook-format';
import { Modal } from '../ui/Modal.js';
import { syntaxOf } from './syntax.js';

const template = templates.avventura;

// The template's full syntax (design decision 10), generated from its data.
export function SyntaxSheet({ checked, onClose }: { checked: boolean; onClose(): void }) {
  const groups = useMemo(() => syntaxOf(template), []);
  // The dialog takes the focus, so the page's shortcuts stand aside and
  // Escape closes it.
  useEffect(() => {
    document.querySelector<HTMLElement>('.syntax-sheet .mh button')?.focus();
  }, []);
  return (
    <Modal title={`Syntax · ${template.name} v${template.version}`} onClose={onClose} className="wide syntax-sheet">
      {!checked && (
        <p className="syntax-note">
          Campaigns are not checked: this is the syntax of adventures and one-shots, for reference.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.title}>
          <h4>{group.title}</h4>
          <table>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.syntax}>
                  <td className="sx">
                    <code>{row.syntax}</code>
                  </td>
                  <td>{row.name}</td>
                  <td className={`rq ${row.requirement ?? ''}`}>{row.requirement ?? ''}</td>
                  <td className="nt">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </Modal>
  );
}
