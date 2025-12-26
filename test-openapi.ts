#!/usr/bin/env bun

/**
 * Test script to fetch NS API OpenAPI specification
 * 
 * Usage:
 *   NS_API_KEY=your-key bun test-openapi.ts
 */

const NS_API_KEY = process.env.NS_API_KEY;

if (!NS_API_KEY) {
  console.error("Error: NS_API_KEY environment variable is required");
  console.error("Usage: NS_API_KEY=your-key bun test-openapi.ts");
  process.exit(1);
}

const OPENAPI_URL = "https://gateway.apiportal.ns.nl/reisinformatie-api/api/openapi";

async function fetchOpenApiSpec() {
  try {
    console.log("Fetching NS API OpenAPI specification...");
    console.log(`URL: ${OPENAPI_URL}`);
    console.log("");

    const headers = new Headers();
    headers.set("Ocp-Apim-Subscription-Key", NS_API_KEY!);
    headers.set("Accept", "application/json");

    const response = await fetch(OPENAPI_URL, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      console.error(`Error: HTTP ${response.status} ${response.statusText}`);
      console.error(`Response: ${await response.text()}`);
      process.exit(1);
    }

    const spec = await response.json();

    // Save to file for analysis
    const fs = await import("fs");
    const specPath = "./openapi-spec.json";
    await fs.promises.writeFile(specPath, JSON.stringify(spec, null, 2));
    console.log(`✓ OpenAPI spec saved to ${specPath}`);

    // Print useful information
    console.log("\n=== API Endpoints ===");
    if (spec.paths) {
      for (const [path, methods] of Object.entries(spec.paths)) {
        console.log(`\n${path}`);
        for (const [method, details] of Object.entries(methods as Record<string, any>)) {
          console.log(`  ${method.toUpperCase()}: ${details.summary || details.description || "No description"}`);
        }
      }
    }

    console.log("\n=== Checking for productTypes parameter ===");
    if (spec.paths) {
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, details] of Object.entries(methods as Record<string, any>)) {
          const params = details.parameters || [];
          const hasProductTypes = params.some((p: any) => 
            p.name === "productTypes" || p.name === "products" || p.name === "travelRequestOptions"
          );
          if (hasProductTypes) {
            console.log(`\n✓ Found in: ${method.toUpperCase()} ${path}`);
            params.forEach((p: any) => {
              console.log(`  Parameter: ${p.name} (${p.in})`);
              console.log(`    Type: ${p.schema?.type}, Array: ${p.schema?.type === 'array'}`);
              if (p.enum) {
                console.log(`    Enum values: ${p.enum.join(", ")}`);
              }
              if (p.schema?.items?.enum) {
                console.log(`    Item enum values: ${p.schema.items.enum.join(", ")}`);
              }
            });
          }
        }
      }
    }

    console.log("\n✓ Done!");

  } catch (error) {
    console.error("Error fetching OpenAPI spec:", error);
    process.exit(1);
  }
}

fetchOpenApiSpec();
