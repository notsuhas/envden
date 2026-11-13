import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { SidebarFooter } from "@/components/docs/sidebar-footer.tsx";
import { baseOptions } from "@/lib/layout-options.tsx";
import { source } from "@/lib/source.ts";

interface IDocsLayout {
  children: ReactNode;
}

export default function Layout(props: IDocsLayout) {
  const { children } = props;

  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      sidebar={{ footer: <SidebarFooter /> }}
    >
      {children}
    </DocsLayout>
  );
}
