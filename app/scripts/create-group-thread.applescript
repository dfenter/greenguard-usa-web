-- Create a named iMessage group thread via Messages GUI automation.
-- Usage: osascript create-group-thread.applescript "5125551234,5125556789,..." "first message" "Group Name"
-- Also applies the most-recently-used group photo (the "Photo" suggestion in
-- the rename sheet — currently the GreenGuard icon, kept at
-- group-icon-greenguard.jpg in this directory for reference). If the
-- suggestion is missing the group is still created and named, just without
-- the icon.
-- Requires: Accessibility permission for the calling process (System Settings >
-- Privacy & Security > Accessibility) AND Automation permission for Messages.
-- Messages takes over the screen while this runs — run when the Mac is idle.
-- Why GUI: macOS removed scriptable group-chat creation and naming from the
-- Messages AppleScript dictionary; driving the UI is the only automated path.
-- Flow: Cmd+N compose -> type each number + Return -> Tab -> body -> Return
-- sends (creating the thread), then Conversations > Show Details ->
-- "Change Group Name and Photo" -> name field -> Done.
on run argv
	if (count of argv) < 3 then
		error "usage: create-group-thread.applescript <phone,phone,...> <first message> <group name>"
	end if
	set targetPhones to item 1 of argv
	set messageText to item 2 of argv
	set groupName to item 3 of argv
	set oldDelims to AppleScript's text item delimiters
	set AppleScript's text item delimiters to ","
	set phoneList to text items of targetPhones
	set AppleScript's text item delimiters to oldDelims
	if (count of phoneList) < 2 then error "need at least 2 phones for a group"

	tell application "Messages" to activate
	delay 1.5
	tell application "System Events"
		tell process "Messages"
			set frontmost to true
			keystroke "n" using command down
			delay 1
			repeat with ph in phoneList
				keystroke (contents of ph)
				delay 1.5
				keystroke return
				delay 0.8
			end repeat
			keystroke tab
			delay 0.5
			keystroke messageText
			delay 0.5
			keystroke return
			delay 2
			-- Rename: open Details popover, click the rename row, fill the sheet.
			click menu item "Show Details" of menu 1 of menu bar item "Conversations" of menu bar 1
			delay 2
			set els to entire contents of pop over 1 of window 1
			repeat with e in els
				try
					if role of e is "AXStaticText" and description of e is "Change Group Name and Photo" then
						click e
						exit repeat
					end if
				end try
			end repeat
			delay 1.5
			set sh to sheet 1 of window 1
			set els2 to entire contents of sh
			-- Apply the group icon: the "Photo" suggestion is the most recently
			-- used group photo (the GreenGuard icon).
			set iconApplied to false
			repeat with e in els2
				try
					if role of e is "AXButton" and description of e is "Photo" then
						click e
						set iconApplied to true
						exit repeat
					end if
				end try
			end repeat
			delay 1
			set els2 to entire contents of sheet 1 of window 1
			repeat with e in els2
				try
					if role of e is "AXTextField" then
						set focused of e to true
						exit repeat
					end if
				end try
			end repeat
			delay 0.3
			keystroke groupName
			delay 0.5
			-- Click Done with retries: the sheet re-renders after the icon click
			-- and a stale element reference can miss.
			repeat 3 times
				set els3 to entire contents of sheet 1 of window 1
				repeat with e in els3
					try
						if role of e is "AXButton" and description of e is "Done" then
							click e
							exit repeat
						end if
					end try
				end repeat
				delay 1.5
				try
					get sheet 1 of window 1
				on error
					exit repeat
				end try
			end repeat
			delay 0.5
		end tell
	end tell
	if iconApplied then
		return "created+named+icon: " & groupName
	else
		return "created+named (NO icon suggestion found): " & groupName
	end if
end run
