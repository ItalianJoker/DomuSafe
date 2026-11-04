import type { SheetMark } from '@domusafe/contracts';

/**
 * Draws the mark of a sheet or a public page.
 *
 * Preconditions: `mark` was chosen from the effective plan.
 * Postconditions: Free and Basic show the product name. Advanced shows nothing.
 * Premium shows the host name, color, welcome sentence and logo when they were set.
 * Data contract: the host fields only. No vault text.
 *
 * @param props - Mark and whether it sits on paper or on a public page.
 * @returns The mark, or nothing.
 */
export function SheetMarkView(props: { readonly mark: SheetMark; readonly place: 'sheet' | 'page' }) {
  if (props.mark.kind === 'none') {
    return null;
  }
  if (props.mark.kind === 'product') {
    if (props.place === 'sheet') {
      return (
        <p aria-hidden="true" className="sheet-watermark">
          DomuSafe
        </p>
      );
    }
    return <p className="text-sm text-muted-foreground">DomuSafe</p>;
  }
  const name =
    props.mark.displayName === null ? null : (
      <p
        className="text-sm font-medium"
        style={props.mark.color === null ? undefined : { color: props.mark.color }}
      >
        {props.mark.displayName}
      </p>
    );
  const body = (
    <div className="flex items-center gap-3">
      {props.mark.logoDataUrl === null ? null : (
        <img src={props.mark.logoDataUrl} alt="" className="h-10 w-10 object-contain" />
      )}
      {props.mark.color !== null && props.mark.displayName === null ? (
        <span
          aria-hidden="true"
          className="inline-block h-3 w-8"
          style={{ backgroundColor: props.mark.color }}
        />
      ) : null}
      {name === null && props.mark.welcome === null ? null : (
        <div>
          {name}
          {props.mark.welcome === null ? null : <p className="text-sm">{props.mark.welcome}</p>}
        </div>
      )}
    </div>
  );
  if (props.place === 'page') {
    return <div className="w-fit rounded-md bg-white px-3 py-2 text-[#111111]">{body}</div>;
  }
  return <div className="mb-3">{body}</div>;
}
