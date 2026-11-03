"use client";

import {
  NetworkMonitoringView,
  type NetworkMonitoringViewProps,
} from "../monitoring/network-monitoring-view";

export type NotificationsViewProps = NetworkMonitoringViewProps;

export const NotificationsView = (props: NotificationsViewProps) => {
  return <NetworkMonitoringView {...props} />;
};

export default NotificationsView;
