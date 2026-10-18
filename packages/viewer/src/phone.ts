// The one phone breakpoint. Media queries cannot read a CSS variable, so JS
// owns the constants and mirrors them onto <html> as [data-phone]; style.css
// and every entry point key off the flag instead of repeating the widths.
// The landscape arm covers foldables unfolded sideways (Fold 7: 832 x 750).
// Its height cap keeps desktop windows desktop: 800px sits above the tallest
// fold landscape viewport and below every fold portrait height (832+).
// Queried per arm, not comma-joined: happy-dom's matchMedia drops comma lists.
export const PHONE_NARROW = "(max-width: 700px)";
export const PHONE_SHORT = "(max-width: 880px) and (max-height: 800px)";

export const isPhone = (view: Window): boolean => view.matchMedia(PHONE_NARROW).matches || view.matchMedia(PHONE_SHORT).matches;

export const syncPhoneFlag = (doc: Document): boolean => {
  const view = doc.defaultView;
  const phone = view !== null && isPhone(view);
  doc.documentElement.toggleAttribute("data-phone", phone);
  return phone;
};

export const watchPhoneFlag = (doc: Document): void => {
  syncPhoneFlag(doc);
  doc.defaultView?.addEventListener("resize", () => { syncPhoneFlag(doc); });
};
