import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultViewTransition: false,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    defaultPreloadStaleTime: 30_000,
  });
};
