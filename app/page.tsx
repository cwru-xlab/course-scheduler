import { title, subtitle } from "@/components/primitives";
import { SchedulerDemo } from "@/components/scheduler/SchedulerDemo";

export default function Home() {
  return (
    <section className="flex flex-col gap-10 py-8 md:py-10">
      <div className="inline-block max-w-3xl">
        <span className={title()}>Weatherhead Course Scheduling</span>
        <div className={subtitle({ class: "mt-4" })}>
          Prototype decision-support UI backed by a server-side mock solver API.
        </div>
      </div>

      <SchedulerDemo />
    </section>
  );
}
