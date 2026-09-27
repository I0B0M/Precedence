export function Footer() {
  return (
    <footer className="foot">
      <p className="note">Data: SEC, Fed, Alpaca, State Street · Not investment advice</p>
      <p className="note">
        This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.
        By using Precedence you agree to the{" "}
        <a href="https://fred.stlouisfed.org/docs/api/terms_of_use.html" target="_blank" rel="noreferrer">FRED® API Terms of Use</a>.
        Prices: IEX via Alpaca, daily, split-adjusted.
      </p>
    </footer>
  );
}
