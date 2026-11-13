import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";
import { GithubMark } from "@/components/site/github-mark.tsx";
import { baseOptions } from "@/lib/layout-options.tsx";
import { DOCS_ROUTE } from "@/lib/routes.ts";
import { GITHUB_URL } from "@/lib/site.ts";

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
        {
          type: "button",
          text: (
            <span className="inline-flex items-center gap-2">
              <GithubMark />
              Star
            </span>
          ),
          url: GITHUB_URL,
          icon: <GithubMark />,
          external: true,
          secondary: true,
        },
      ]}
    >
      {children}
    </HomeLayout>
  );
}
