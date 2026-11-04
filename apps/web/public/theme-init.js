/**
 * Applies the saved theme before the app loads, so the first paint matches the last choice.
 * The account preference replaces this value after sign-in.
 */
(function () {
  var stored = localStorage.getItem('domusafe.theme');
  var theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  document.documentElement.dataset.theme = theme;
})();
