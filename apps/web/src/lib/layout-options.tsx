import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Wordmark } from "@/components/site/wordmark.tsx";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Wordmark />,
    },
  };
}
