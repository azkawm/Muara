import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AdminPage } from "../routes/admin";
import { DashboardPage } from "../routes/dashboard";
import { FaucetPage } from "../routes/faucet";
import { HistoryPage } from "../routes/history";
import { LandingPage } from "../routes/landing";
import { MarketsPage } from "../routes/markets";
import { ShortPage } from "../routes/short";
import { Layout } from "./layout";

const root = createRootRoute({ component: Layout });

const routes = [
  createRoute({ getParentRoute: () => root, path: "/", component: LandingPage }),
  createRoute({ getParentRoute: () => root, path: "/markets", component: MarketsPage }),
  createRoute({ getParentRoute: () => root, path: "/dashboard", component: DashboardPage }),
  createRoute({ getParentRoute: () => root, path: "/short", component: ShortPage }),
  createRoute({ getParentRoute: () => root, path: "/history", component: HistoryPage }),
  createRoute({ getParentRoute: () => root, path: "/faucet", component: FaucetPage }),
  createRoute({ getParentRoute: () => root, path: "/admin", component: AdminPage }),
];

export const router = createRouter({ routeTree: root.addChildren(routes), defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
