// The views of a project other than Document (connector design decision 12;
// the board from asset-board design decision 12).
export const projectViews = ['inspiration', 'research', 'board', 'log', 'history'] as const;
export type ProjectViewId = (typeof projectViews)[number];
