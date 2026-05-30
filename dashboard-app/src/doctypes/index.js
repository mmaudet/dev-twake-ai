// Minimal schema for cozy-client. io.cozy.files covers both files and notes
// (notes are stored as files with class === 'note'). io.cozy.settings stores
// the dashboard layout under the key dashboard_layout.
export default {
  files: {
    doctype: 'io.cozy.files',
    attributes: {},
    relationships: {}
  },
  settings: {
    doctype: 'io.cozy.settings',
    attributes: {},
    relationships: {}
  }
}
