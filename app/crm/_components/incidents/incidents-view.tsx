"use client";

import {
  NetworkMonitoringView,
  type NetworkMonitoringViewProps,
  type IncomingPushAlert,
} from "../monitoring/network-monitoring-view";

export type IncidentsViewProps = NetworkMonitoringViewProps;
export type { IncomingPushAlert };

export const IncidentsView = (props: IncidentsViewProps) => {
  return <NetworkMonitoringView {...props} />;
};

export default IncidentsView;
