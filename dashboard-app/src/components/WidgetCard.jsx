import React from 'react'
import Card from 'cozy-ui/transpiled/react/Card'

const WidgetCard = ({ title, children }) => (
  <Card className="dashboard-widget-card u-flex u-flex-column u-h-100 u-p-0">
    <div className="widget-drag-handle u-flex u-flex-items-center u-pv-half u-ph-1 u-bdb-1">
      <span className="u-fz-small u-fw-bold u-c-grey">{title}</span>
    </div>
    <div className="dashboard-widget-body u-flex-grow-1 u-ovh-auto u-p-1">
      {children}
    </div>
  </Card>
)

export default WidgetCard
