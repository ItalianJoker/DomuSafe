import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Recipe, RecipeIngredient } from '@domusafe/contracts';
import { useApi } from '@/components/api-context.js';
import { Field } from '@/components/shell/page.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Textarea } from '@/components/ui/textarea.js';
import { problemText } from '@/lib/copy.js';
import { recipesQuery } from '@/lib/queries.js';
import { m } from '@/paraglide/messages.js';

const touchControl =
  'min-h-12 w-full rounded-md border border-input bg-transparent px-3 text-[15px] text-foreground';

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function parseIngredients(value: string): RecipeIngredient[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 200)
    .map((name) => ({ name: name.slice(0, 160), quantity: null, unit: null, note: null }));
}

function parseSteps(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 200)
    .map((step) => step.slice(0, 2000));
}

function parseTags(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 32);
}

function minutesLabel(value: number | null): string {
  if (value === null) {
    return '—';
  }
  return m.extraMinutes({ count: String(value) });
}

/**
 * Manual recipe library with optional import from a public page address.
 *
 * Preconditions: the caller can read kitchen recipes.
 * Postconditions: creates and edits persist in Postgres; import uses the server SSRF-safe fetcher.
 * Data contract: no browser source of truth.
 *
 * @param props - Family and write capability.
 * @returns The panel.
 */
export function RecipesPanel(props: { readonly familyId: string; readonly canWrite: boolean }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const recipes = useQuery(recipesQuery(api, props.familyId));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState('');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [cookMinutes, setCookMinutes] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [tags, setTags] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['recipes', props.familyId] });
  }

  function fillForm(recipe: Recipe): void {
    setEditing(recipe);
    setTitle(recipe.title);
    setDescription(recipe.description ?? '');
    setServings(recipe.servings === null ? '' : String(recipe.servings));
    setPrepMinutes(recipe.prepMinutes === null ? '' : String(recipe.prepMinutes));
    setCookMinutes(recipe.cookMinutes === null ? '' : String(recipe.cookMinutes));
    setIngredients(recipe.ingredients.map((item) => item.name).join('\n'));
    setSteps(recipe.steps.join('\n'));
    setTags(recipe.tags.join(', '));
    setError(null);
    setImportNote(null);
  }

  function clearForm(): void {
    setEditing(null);
    setTitle('');
    setDescription('');
    setServings('');
    setPrepMinutes('');
    setCookMinutes('');
    setIngredients('');
    setSteps('');
    setTags('');
  }

  async function saveRecipe(): Promise<void> {
    if (title.trim() === '') {
      setError(m.extraRecipeNeedTitle());
      return;
    }
    const servingsNumber = servings.trim() === '' ? null : Number.parseInt(servings, 10);
    const prepNumber = prepMinutes.trim() === '' ? null : Number.parseInt(prepMinutes, 10);
    const cookNumber = cookMinutes.trim() === '' ? null : Number.parseInt(cookMinutes, 10);
    if (servingsNumber !== null && (!Number.isFinite(servingsNumber) || servingsNumber < 1)) {
      setError(m.extraRecipeNeedServings());
      return;
    }
    setPending(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        description: blank(description),
        servings: servingsNumber,
        prepMinutes: prepNumber !== null && Number.isFinite(prepNumber) ? prepNumber : null,
        cookMinutes: cookNumber !== null && Number.isFinite(cookNumber) ? cookNumber : null,
        ingredients: parseIngredients(ingredients),
        steps: parseSteps(steps),
        tags: parseTags(tags),
      };
      if (editing === null) {
        await api.createRecipe(props.familyId, crypto.randomUUID(), body);
      } else {
        await api.updateRecipe(props.familyId, editing.id, editing.version, body);
      }
      clearForm();
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function removeRecipe(recipe: Recipe): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await api.deleteRecipe(props.familyId, recipe.id, recipe.version);
      if (editing?.id === recipe.id) {
        clearForm();
      }
      await refresh();
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  async function importFromUrl(): Promise<void> {
    if (importUrl.trim() === '') {
      setError(m.extraRecipeNeedUrl());
      return;
    }
    setPending(true);
    setError(null);
    setImportNote(null);
    try {
      const result = await api.importRecipe(props.familyId, crypto.randomUUID(), {
        url: importUrl.trim(),
      });
      if (result.status === 'succeeded') {
        setImportNote(m.extraRecipeImportOk());
        setImportUrl('');
        await refresh();
      } else {
        setError(m.extraRecipeImportFailed({ code: result.errorCode ?? result.status }));
      }
    } catch (caught) {
      setError(problemText(caught));
    } finally {
      setPending(false);
    }
  }

  if (recipes.isPending) {
    return <p className="text-[13px] text-muted-foreground">{m.loading()}</p>;
  }
  if (recipes.isError) {
    return (
      <p role="alert" className="text-[13px] text-destructive">
        {problemText(recipes.error)}
      </p>
    );
  }

  const items = recipes.data;

  return (
    <section className="grid max-w-xl gap-8">
      <div>
        <h2 className="text-[15px] font-medium">{m.extraRecipesTitle()}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.extraRecipesLead()}</p>
      </div>

      {props.canWrite ? (
        <div className="grid gap-4">
          <h3 className="text-[13px] font-medium">
            {editing === null ? m.extraRecipeCreate() : m.extraRecipeEdit()}
          </h3>
          <Field label={m.extraRecipeTitle()} htmlFor="recipe-title">
            <Input
              className={touchControl}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label={m.extraRecipeDescription()} htmlFor="recipe-description">
            <Textarea
              id="recipe-description"
              className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-[15px]"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={m.extraRecipeServings()} htmlFor="recipe-servings">
              <Input
                id="recipe-servings"
                className={touchControl}
                inputMode="numeric"
                value={servings}
                onChange={(event) => setServings(event.target.value)}
              />
            </Field>
            <Field label={m.extraRecipePrep()} htmlFor="recipe-prep">
              <Input
                id="recipe-prep"
                className={touchControl}
                inputMode="numeric"
                value={prepMinutes}
                onChange={(event) => setPrepMinutes(event.target.value)}
              />
            </Field>
            <Field label={m.extraRecipeCook()} htmlFor="recipe-cook">
              <Input
                id="recipe-cook"
                className={touchControl}
                inputMode="numeric"
                value={cookMinutes}
                onChange={(event) => setCookMinutes(event.target.value)}
              />
            </Field>
          </div>
          <Field label={m.extraRecipeIngredients()} htmlFor="recipe-ingredients">
            <Textarea
              id="recipe-ingredients"
              className="min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-[15px]"
              value={ingredients}
              onChange={(event) => setIngredients(event.target.value)}
              placeholder={m.extraRecipeIngredientsHint()}
            />
          </Field>
          <Field label={m.extraRecipeSteps()} htmlFor="recipe-steps">
            <Textarea
              id="recipe-steps"
              className="min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-[15px]"
              value={steps}
              onChange={(event) => setSteps(event.target.value)}
              placeholder={m.extraRecipeStepsHint()}
            />
          </Field>
          <Field label={m.extraRecipeTags()} htmlFor="recipe-tags">
            <Input
              id="recipe-tags"
              className={touchControl}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="emergency" disabled={pending} onClick={() => void saveRecipe()}>
              {editing === null ? m.save() : m.extraRecipeSaveEdit()}
            </Button>
            {editing === null ? null : (
              <Button variant="outline" size="emergency" disabled={pending} onClick={clearForm}>
                {m.extraCancel()}
              </Button>
            )}
          </div>

          <div className="grid gap-3 border-t border-border pt-4">
            <h3 className="text-[13px] font-medium">{m.extraRecipeImport()}</h3>
            <p className="text-[13px] text-muted-foreground">{m.extraRecipeImportLead()}</p>
            <Field label={m.extraRecipeUrl()} htmlFor="recipe-url">
              <Input
                id="recipe-url"
                className={touchControl}
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
                inputMode="url"
              />
            </Field>
            <Button
              variant="outline"
              size="emergency"
              disabled={pending}
              onClick={() => void importFromUrl()}
            >
              {m.extraRecipeImportAction()}
            </Button>
            {importNote === null ? null : <p className="text-[13px] text-muted-foreground">{importNote}</p>}
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">{m.extraRecipesReadOnly()}</p>
      )}

      {error === null ? null : (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-[13px] font-medium">{m.extraRecipesList()}</h3>
        {items.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{m.extraRecipesEmpty()}</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {items.map((recipe) => (
              <li key={recipe.id} className="grid gap-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-medium">{recipe.title}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {m.extraRecipeMeta({
                        servings: recipe.servings === null ? '—' : String(recipe.servings),
                        prep: minutesLabel(recipe.prepMinutes),
                        cook: minutesLabel(recipe.cookMinutes),
                      })}
                    </p>
                  </div>
                  {props.canWrite ? (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-12"
                        disabled={pending}
                        onClick={() => fillForm(recipe)}
                      >
                        {m.extraEdit()}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-12 text-destructive"
                        disabled={pending}
                        onClick={() => void removeRecipe(recipe)}
                      >
                        {m.extraDelete()}
                      </Button>
                    </div>
                  ) : null}
                </div>
                {recipe.ingredients.length === 0 ? null : (
                  <p className="text-[13px] text-muted-foreground">
                    {recipe.ingredients
                      .slice(0, 4)
                      .map((item) => item.name)
                      .join(' · ')}
                    {recipe.ingredients.length > 4 ? '…' : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
