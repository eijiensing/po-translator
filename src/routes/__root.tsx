import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				title: "PO Translator",
			},
		],
	}),
	component: () => (
		<>
			<HeadContent />
			<Outlet />
			<TanStackRouterDevtools />
		</>
	),
});
