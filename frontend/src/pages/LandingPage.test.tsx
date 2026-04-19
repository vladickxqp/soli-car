import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import LandingPage from "./LandingPage";

describe("LandingPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders the product presentation and primary calls to action", async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Soli Car")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Fleet operations with clear ownership/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Login" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Open demo" }).length).toBeGreaterThan(0);
  });
});
