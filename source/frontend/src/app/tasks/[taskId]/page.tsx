import { TaskDetail } from "@/components/task-detail";

export const metadata = { title: "制作任务 · 素材工坊" };
export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14"><TaskDetail id={taskId} /></main>;
}
