import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultViewTransition: false,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 30_000,
  });
};
