import { redirect } from "next/navigation";

// Redirect to the sample notebook by default
export default function NotebookIndexPage() {
  redirect("/ipynb/sample");
}
