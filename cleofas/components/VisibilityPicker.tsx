import type { Visibility } from "@/lib/constants";

// Radio group for choosing who can see and reply to a post.
export function VisibilityPicker({ name = "visibility", defaultValue = "public" }: { name?: string; defaultValue?: Visibility }) {
  const options: { value: Visibility; label: string; hint: string }[] = [
    { value: "public", label: "Public", hint: "Any signed-in user can see and reply" },
    { value: "mutuals", label: "Mutuals", hint: "Only people you follow who follow you back" },
  ];

  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">Who can see and reply</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
        >
          <input type="radio" name={name} value={option.value} defaultChecked={option.value === defaultValue} className="mt-1" />
          <span>
            <span className="block font-medium">{option.label}</span>
            <span className="block text-xs text-muted">{option.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
