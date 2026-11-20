import { createRouter } from "@tanstack/react-router";
import { ErrorCard } from "./AppBoundary";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => createRouter({ routeTree, scrollRestoration: true, defaultErrorComponent: ({ error }) => <ErrorCard error={error} /> });
