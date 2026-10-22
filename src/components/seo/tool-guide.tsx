import { ChevronDown } from "lucide-react";
import type { ToolDefinition } from "@/config/site";
import { toolSeo } from "@/config/seo";

/** Visible how-to and FAQ for a tool page; the FAQ mirrors its FAQPage structured data. */
export function ToolGuide({ tool }: { tool: ToolDefinition }) {
  const seo = toolSeo[tool.id];
  return (
    <div className="mt-14 grid gap-10 border-t border-border pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-14">
      <section aria-labelledby={`${tool.id}-how-title`}>
        <h2 id={`${tool.id}-how-title`} className="text-xl font-semibold">
          How to use the {tool.title}
        </h2>
        <ol className="mt-6 space-y-5">
          {seo.steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-sm font-semibold tabular shadow-soft">
                {index + 1}
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby={`${tool.id}-faq-title`}>
        <h2 id={`${tool.id}-faq-title`} className="text-xl font-semibold">
          Frequently asked questions
        </h2>
        <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card shadow-soft">
          {seo.faqs.map((faq) => (
            <details key={faq.q} className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                {faq.q}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pb-4 text-sm text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
