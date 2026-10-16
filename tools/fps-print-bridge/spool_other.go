//go:build !windows

package main

import (
	"errors"
	"os"
)

// Non-Windows builds are only for local testing: jobs are appended to the file in
// FPS_BRIDGE_DUMP (default ./fps-bridge-jobs.bin) instead of a printer.

func rawPrint(printer, docName string, data []byte) error {
	path := os.Getenv("FPS_BRIDGE_DUMP")
	if path == "" {
		path = "fps-bridge-jobs.bin"
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if printer == "" {
		return errors.New("no printer")
	}
	_, err = f.Write(data)
	return err
}

func listPrinters() ([]string, error) { return []string{"Test Label Printer"}, nil }

func defaultPrinter() string { return "Test Label Printer" }
