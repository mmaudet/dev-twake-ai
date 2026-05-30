import React from 'react'

const WidgetCard = ({ title, children }) => (
  <section className="dashboard-widget-card">
    <div className="widget-drag-handle">
      <span className="widget-title">{title}</span>
    </div>
    <div className="dashboard-widget-body">{children}</div>
  </section>
)

export default WidgetCard
