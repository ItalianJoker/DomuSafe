import { useMemo } from 'react';
import { renderSVG } from 'uqr';

/**
 * A sharp code for print. Loaded only with the print screen.
 *
 * Preconditions: `value` is the absolute address of a public page.
 * Postconditions: the drawing is an image with a name, on a white ground.
 * Data contract: the address is encoded; it is not written as text inside the drawing.
 *
 * @param props - Address, caption and size.
 * @returns The drawing.
 */
export function QrMark(props: { readonly value: string; readonly title: string; readonly large?: boolean }) {
  const svg = useMemo(
    () =>
      renderSVG(props.value, {
        ecc: 'Q',
        border: 2,
        pixelSize: props.large === true ? 8 : 5,
        whiteColor: '#ffffff',
        blackColor: '#111111',
      }),
    [props.large, props.value],
  );
  return (
    <div
      role="img"
      aria-label={props.title}
      className={props.large === true ? 'w-52' : 'w-36'}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
