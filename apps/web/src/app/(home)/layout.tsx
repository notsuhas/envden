import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout-options.tsx";
import { DOCS_ROUTE } from "@/lib/routes.ts";

interface IHomeLayout {
  children: ReactNode;
}

export default function Layout(props: IHomeLayout) {
  const { children } = props;

  return (
    <HomeLayout
      {...baseOptions()}
      links={[
        { text: "Docs", url: DOCS_ROUTE, active: "nested-url" },
        { text: "Security", url: `${DOCS_ROUTE}/security` },
      ]}
    >
      {children}
    </HomeLayout>
  );
}
