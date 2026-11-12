import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // No View Transitions: the browser would first snapshot the old screen and keep taps
    // blocked for the whole cross-fade. Each screen already animates in (.bw-route-motion),
    // so a tab responds on the next frame instead.
    defaultViewTransition: false,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 30_000,
  });
};
