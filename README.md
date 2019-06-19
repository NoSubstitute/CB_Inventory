# CB_Inventory
A Google Apps Script using Google Sheets to manage Chrome devices in a G Suite domain.

Replacement of Chromebookinventory?
A contender, perhaps, but it doesn't have all the bells and whistles of CI. :-)

As some of you may have noticed, Chromebookinventory will disappear during summer. The announcement says it's because of an API change.

So after my most recent coding attempt, I kept fiddling with Google Apps Script and put together a Sheet that can manage your Chromebooks. It grabs a lot of relevant data into a sheet and displays it in various ways.

Then also a way to update devices of your choice.

I definitely recommend you read the contents of the scripts (two) before running it's functions. If for nothing else at least so you know it looks like it'll only do what I say. Click Tools /Script editor in the Sheets menu to open it to read.

The scripts can't do anything at all until you authorise them.

I've run the export from a domain with 23 500 devices, without getting a time-out. It did take a while, but it kept going till it was done.

Now, this is not as fancy as GAT+, Gopher for Chrome, BetterCloud or Fleet or other such professional tools, but it has two advantages. It's free, and, for a lot of people, easier than doing the management with GAM.

GAM can, of course, do all this, but it requires a steady hand.

This little thing works great with copy/paste, and a simple menu with two options, export or update.

Link to copyable CB_Inventory.

Click the link with your Chromebook admin (often superadmin) account.

Remove Copy of and  - Template from name of spreadsheet.

Try to run CB Inventory / 1. Export CBs. It should ask for authorisation.

Allow access to your superadmin/CB Admin account. Else nothing will work.

The script will run and try to download all your CBs' data to the sheet called Devices.

If you wish to update any devices' data, copy necessary data to the sheet UpdateCBs.

All headers have small comments on what you can do and shouldn't.

https://docs.google.com/spreadsheets/d/13LY-vPYSpr-hSTy7fIzg9Y7nASiGbNzqegaaVaaYd3s/copy 

If you don't want to create a Sheet copy, the two scripts are also available here in this repo.

DO NOTE!
If you copy the scripts from here, instead of copying the entire Sheets file, you will have to enable the API.

For a couple of minutes I had the API disabled in my template (my bad). 
Then it isn't automatically turned on when you try to run it.

I've since enabled the API setting again, so future copies should not run into that problem. If you do, you can enable the API manually.

Tools / Script Editor

Resources

Advanced Google Services

Then click the button for 

Admin Directory API

Ok and save.

PRIVACY POLICY

You are in full control of all the data.
The script is only accessing data you yourself have access to.
No data is sent anywhere, except between you and Google.
