import RecentFiles from 'src/components/widgets/RecentFiles'
import RecentNotes from 'src/components/widgets/RecentNotes'
import Tasks from 'src/components/widgets/Tasks'

// The widget catalogue. Each entry describes a widget that can be installed
// on the dashboard. Order in this object drives the order in the "Gérer les
// widgets" page (which is the only place the catalogue is iterated).
//
// Fields:
// - id           : stable key used in the saved layout AND in the per-widget
//                  config sub-object. Never change it after release.
// - name         : human label shown in the store.
// - description  : short tagline shown in the store.
// - icon         : cozy-ui icon name for the card thumbnail.
// - accent       : CSS color for the thumbnail background (icon-* classes).
// - category     : 'cozy' | 'external' | 'coming-soon' — drives a section
//                  header and disables toggles for unreleased widgets.
// - Component    : React component to render in the dashboard grid.
// - defaultLayout: w/h/min sizing hints used when the widget is enabled.
// - needsConfig  : true if the widget refuses to render until per-widget
//                  config is filled in (handled inside the component).
export const WIDGET_CATALOG = {
  recentFiles: {
    id: 'recentFiles',
    name: 'Fichiers récents',
    description: 'Vos derniers fichiers Drive et raccourcis.',
    icon: 'file-type-cloud',
    accent: 'icon-file',
    category: 'cozy',
    Component: RecentFiles,
    defaultLayout: { w: 6, h: 6, minW: 3, minH: 4 },
    needsConfig: false,
    enabledByDefault: true
  },
  recentNotes: {
    id: 'recentNotes',
    name: 'Notes récentes',
    description: 'Vos dernières notes Cozy.',
    icon: 'file-type-text',
    accent: 'icon-note',
    category: 'cozy',
    Component: RecentNotes,
    defaultLayout: { w: 6, h: 6, minW: 3, minH: 4 },
    needsConfig: false,
    enabledByDefault: true
  },
  tasks: {
    id: 'tasks',
    name: 'Tâches kan.bn',
    description: 'Vos cards kan.bn assignées.',
    icon: 'check-square',
    accent: 'icon-task',
    category: 'external',
    Component: Tasks,
    defaultLayout: { w: 6, h: 6, minW: 3, minH: 4 },
    needsConfig: true, // kan.bn API key
    enabledByDefault: true
  },
  mail: {
    id: 'mail',
    name: 'Mail (Twake Linagora)',
    description: 'Les 10 derniers mails de votre boîte. À brancher sur Twake Mail.',
    icon: 'email',
    accent: 'icon-shortcut',
    category: 'coming-soon',
    Component: null,
    defaultLayout: { w: 6, h: 7, minW: 3, minH: 4 },
    needsConfig: true,
    enabledByDefault: false
  },
  calendar: {
    id: 'calendar',
    name: 'Calendrier (Twake Linagora)',
    description: 'Vos rendez-vous du jour avec navigation jour par jour.',
    icon: 'calendar',
    accent: 'icon-task',
    category: 'coming-soon',
    Component: null,
    defaultLayout: { w: 6, h: 7, minW: 3, minH: 4 },
    needsConfig: true,
    enabledByDefault: false
  }
}

export const CATEGORY_LABEL = {
  cozy: 'Données Cozy',
  external: 'Services externes',
  'coming-soon': 'Bientôt disponible'
}

export const listWidgets = () => Object.values(WIDGET_CATALOG)
export const getWidget = id => WIDGET_CATALOG[id] || null
