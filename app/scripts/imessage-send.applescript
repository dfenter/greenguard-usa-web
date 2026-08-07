-- Send an iMessage via the Messages app.
-- Usage: osascript imessage-send.applescript "+15125551234[,+15125556789,...]" "message body"
-- One phone sends a normal 1:1 iMessage; multiple comma-separated phones send a
-- single group iMessage (all participants see each other and any replies).
-- Exits 0 on success; nonzero (with error text on stderr) on failure so the
-- caller can treat it as a failed send and surface/log it.
on run argv
	if (count of argv) < 2 then
		error "usage: imessage-send.applescript <phone[,phone...]> <body>"
	end if
	set targetPhones to item 1 of argv
	set messageText to item 2 of argv
	set oldDelims to AppleScript's text item delimiters
	set AppleScript's text item delimiters to ","
	set phoneList to text items of targetPhones
	set AppleScript's text item delimiters to oldDelims
	tell application "Messages"
		-- Bind to the iMessage service explicitly (avoids SMS relay ambiguity).
		set imsg to 1st account whose service type = iMessage
		if (count of phoneList) is 1 then
			send messageText to participant (item 1 of phoneList) of imsg
		else
			set groupBuddies to {}
			repeat with p in phoneList
				set end of groupBuddies to participant (contents of p) of imsg
			end repeat
			set groupChat to make new text chat with properties {participants:groupBuddies}
			send messageText to groupChat
		end if
	end tell
end run
