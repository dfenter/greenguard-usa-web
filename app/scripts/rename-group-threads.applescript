-- Rename daemon-created group threads to a standard name ("GreenGuard USA").
-- Usage: osascript rename-group-threads.applescript "GreenGuard USA"
-- Finds every 3-participant group chat containing BOTH tech numbers
-- (Bruce +15127973348, Zeke +15127873263) whose name is not already the
-- target, opens each via the sms:// URL scheme (compose to the same
-- participant set lands in the existing thread), and applies the rename
-- through the Conversation Details sheet — same GUI recipe as
-- create-group-thread.applescript (see memory reference-messages-gui-automation).
-- Exits "no-candidates" WITHOUT touching the GUI when there is nothing to do,
-- so the nightly run is a no-op most days. Renames only — no icon (Dan
-- 2026-08-07: no automated icons). Requires Accessibility + Automation for
-- the calling process; aborts safely if focus is stolen mid-run.
property techA : "+15127973348"
property techB : "+15127873263"

on assertFront()
	tell application "System Events"
		set fp to name of first application process whose frontmost is true
		if fp is not "Messages" then error "ABORT: focus stolen by " & fp
	end tell
end assertFront

on clickSheetButton(btnDesc)
	tell application "System Events"
		tell process "Messages"
			set els to entire contents of sheet 1 of window 1
			repeat with e in els
				try
					if role of e is "AXButton" and description of e is btnDesc then
						click e
						return true
					end if
				end try
			end repeat
		end tell
	end tell
	return false
end clickSheetButton

on renameOpenConversation(groupName)
	tell application "System Events"
		tell process "Messages"
			set pop to missing value
			repeat 4 times
				click menu item "Show Details" of menu 1 of menu bar item "Conversations" of menu bar 1
				delay 2.5
				try
					set pop to pop over 1 of window 1
					exit repeat
				end try
			end repeat
			if pop is missing value then error "details popover never opened"
			set els to entire contents of pop
			set renameControl to false
			repeat with e in els
				try
					if role of e is "AXStaticText" and description of e is "Change Group Name and Photo" then
						click e
						set renameControl to true
						exit repeat
					end if
				end try
			end repeat
			-- SMS/MMS groups have no rename control — Apple only supports naming
			-- pure-iMessage groups. Close the popover and report it as unsupported.
			if not renameControl then
				key code 53 -- Escape
				error "SMS_GROUP_UNSUPPORTED"
			end if
			delay 2
			-- Name: focus field, type, VERIFY, retype on mismatch
			repeat with attempt from 1 to 3
				set tf to missing value
				set els3 to entire contents of sheet 1 of window 1
				repeat with e in els3
					try
						if role of e is "AXTextField" then
							set tf to e
							exit repeat
						end if
					end try
				end repeat
				if tf is missing value then error "name field not found"
				set focused of tf to true
				delay 0.5
				keystroke "a" using command down
				delay 0.2
				my assertFront()
				keystroke groupName
				delay 0.8
				if (value of tf) is groupName then exit repeat
				if attempt is 3 then error "name field kept mismatching: " & (value of tf)
			end repeat
			-- Done, retried until the sheet actually closes
			repeat 4 times
				my clickSheetButton("Done")
				delay 2
				try
					get sheet 1 of window 1
				on error
					exit repeat
				end try
			end repeat
			try
				get sheet 1 of window 1
				my clickSheetButton("Cancel")
				error "sheet would not close (cancelled)"
			end try
		end tell
	end tell
end renameOpenConversation

on run argv
	set groupName to "GreenGuard USA"
	if (count of argv) ≥ 1 then set groupName to item 1 of argv

	-- Collect candidates WITHOUT any GUI: 3-way groups with both techs,
	-- not already named. Record each customer's handle for open + verify.
	set candidates to {}
	tell application "Messages"
		repeat with c in chats
			try
				set pl to participants of c
				if (count of pl) is 3 then
					set hasA to false
					set hasB to false
					set customerHandle to ""
					repeat with p in pl
						set h to handle of p
						if h is techA then
							set hasA to true
						else if h is techB then
							set hasB to true
						else
							set customerHandle to h
						end if
					end repeat
					if hasA and hasB and customerHandle is not "" then
						set curName to ""
						try
							set curName to name of c
						end try
						if curName is not groupName then set end of candidates to customerHandle
					end if
				end if
			end try
		end repeat
	end tell
	if (count of candidates) is 0 then return "no-candidates"

	set results to {}
	repeat with customerHandle in candidates
		set ch to contents of customerHandle
		set last4 to text -4 thru -1 of ch
		try
			tell application "Messages" to activate
			delay 1.5
			open location "sms://open?addresses=" & ch & "," & techA & "," & techB
			delay 3
			my assertFront()
			tell application "System Events"
				tell process "Messages"
					if (name of window 1) does not contain last4 then
						error "WRONG_CONVERSATION: window is " & (name of window 1)
					end if
				end tell
			end tell
			my renameOpenConversation(groupName)
			set end of results to "renamed:" & ch
		on error errMsg
			set end of results to "FAILED:" & ch & " (" & errMsg & ")"
		end try
	end repeat

	set oldDelims to AppleScript's text item delimiters
	set AppleScript's text item delimiters to "; "
	set out to results as text
	set AppleScript's text item delimiters to oldDelims
	return out
end run
