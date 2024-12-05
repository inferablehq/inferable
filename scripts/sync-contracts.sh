#!/bin/bash

# Find the source contract file
SOURCE_CONTRACT="control-plane/src/modules/contract.ts"

if [ ! -f "$SOURCE_CONTRACT" ]; then
    echo "Error: Source contract file not found at $SOURCE_CONTRACT"
    exit 1
fi

# Find all contract.ts files recursively, excluding the source file and node_modules
find . -name "contract.ts" -not -path "*/node_modules/*" -not -path "./control-plane/src/modules/contract.ts" | while read -r target_file; do
    echo "Syncing contract to: $target_file"

    # Create backup of target file
    cp "$target_file" "${target_file}.backup"

    # Copy source contract to target location
    cp "$SOURCE_CONTRACT" "$target_file"

    # Check if copy was successful
    if [ $? -eq 0 ]; then
        echo "Successfully synced contract to: $target_file"
        rm "${target_file}.backup"
    else
        echo "Error syncing contract to: $target_file"
        # Restore backup if copy failed
        mv "${target_file}.backup" "$target_file"
    fi
done

echo "Contract sync complete"
